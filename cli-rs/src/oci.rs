// Minimal OCI registry client (sync, ureq) — just enough to push cosign-format
// signatures/attestations next to an image, so `cosign verify <image>` works.
//
// Design: the registry holds the artifacts; the Let's Seal signing service holds
// the key. sealbot resolves the image digest here, has the service sign the
// cosign payload, then constructs + pushes the `.sig` OCI image. No signing
// happens in this file — it is pure registry plumbing.
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub const OCI_CONFIG: &str = "application/vnd.oci.image.config.v1+json";
pub const OCI_MANIFEST: &str = "application/vnd.oci.image.manifest.v1+json";
pub const COSIGN_LAYER: &str = "application/vnd.dev.cosign.simplesigning.v1+json";
pub const DSSE_LAYER: &str = "application/vnd.dsse.envelope.v1+json";
// Accept both OCI and Docker manifest + index media types when resolving a ref.
const MANIFEST_ACCEPT: &str = "application/vnd.oci.image.manifest.v1+json, \
application/vnd.oci.image.index.v1+json, \
application/vnd.docker.distribution.manifest.v2+json, \
application/vnd.docker.distribution.manifest.list.v2+json";

pub fn sha256_digest(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("sha256:{:x}", h.finalize())
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// A parsed image reference: registry host, repository, and a tag-or-digest.
pub struct ImageRef {
    pub registry: String,
    pub repo: String,
    pub reference: String, // a tag, or "sha256:..."
}

impl ImageRef {
    pub fn parse(image: &str) -> Result<ImageRef, String> {
        let (registry, rest) = match image.split_once('/') {
            // The first segment is a registry only if it looks like a host
            // (has a dot or port, or is localhost). Otherwise it's a Docker Hub
            // short name, which we do not special-case — require an explicit host.
            Some((first, rest))
                if first.contains('.') || first.contains(':') || first == "localhost" =>
            {
                (first.to_string(), rest.to_string())
            }
            _ => return Err(format!(
                "image must include a registry host, e.g. ttl.sh/{image} or ghcr.io/org/{image}"
            )),
        };
        // Split repo from the tag/digest. A digest uses '@'; a tag is a ':' AFTER
        // the last '/' (so a registry port earlier in the string isn't mistaken).
        let (repo, reference) = if let Some((r, d)) = rest.split_once('@') {
            (r.to_string(), d.to_string())
        } else {
            let tag_pos = rest.rfind(':').filter(|&i| !rest[i..].contains('/'));
            match tag_pos {
                Some(i) => (rest[..i].to_string(), rest[i + 1..].to_string()),
                None => (rest.clone(), "latest".to_string()),
            }
        };
        Ok(ImageRef { registry, repo, reference })
    }

    pub fn scheme(&self) -> &'static str {
        if self.registry.starts_with("localhost") || self.registry.starts_with("127.0.0.1") {
            "http"
        } else {
            "https"
        }
    }

    fn base(&self) -> String {
        format!("{}://{}/v2/{}", self.scheme(), self.registry, self.repo)
    }
}

/// Registry client with per-repo bearer-token caching + optional Basic creds
/// (SEALBOT_REGISTRY_USER / _PASS) for the token fetch on private registries.
pub struct Client {
    tokens: HashMap<String, String>,
    user: Option<String>,
    pass: Option<String>,
}

impl Client {
    pub fn new() -> Client {
        let ne = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
        Client { tokens: HashMap::new(), user: ne("SEALBOT_REGISTRY_USER"), pass: ne("SEALBOT_REGISTRY_PASS") }
    }

    // Fetch a bearer token for a WWW-Authenticate challenge, caching per repo.
    fn fetch_token(&mut self, repo: &str, challenge: &str) -> Option<String> {
        if let Some(t) = self.tokens.get(repo) {
            return Some(t.clone());
        }
        let params = parse_challenge(challenge);
        let realm = params.get("realm")?;
        let mut url = format!("{realm}?");
        if let Some(s) = params.get("service") {
            url.push_str(&format!("service={}&", urlenc(s)));
        }
        if let Some(s) = params.get("scope") {
            url.push_str(&format!("scope={}", urlenc(s)));
        }
        let mut req = ureq::get(&url);
        if let (Some(u), Some(p)) = (&self.user, &self.pass) {
            // Only hand Basic credentials to an https auth realm. A hostile registry
            // can dictate the realm in its 401, so an http (or attacker) realm would
            // otherwise harvest the registry password in cleartext.
            if !realm.to_ascii_lowercase().starts_with("https://") {
                eprintln!("sealbot: refusing to send registry credentials to a non-https auth realm ({realm})");
                return None;
            }
            req = req.set("Authorization", &format!("Basic {}", b64(format!("{u}:{p}").as_bytes())));
        }
        let resp = req.call().ok()?;
        let j: serde_json::Value = resp.into_json().ok()?;
        let tok = j.get("token").or_else(|| j.get("access_token"))?.as_str()?.to_string();
        self.tokens.insert(repo.to_string(), tok.clone());
        Some(tok)
    }

    // Issue a request, transparently handling a one-shot 401 bearer challenge.
    fn send(
        &mut self,
        method: &str,
        url: &str,
        repo: &str,
        headers: &[(&str, &str)],
        body: Option<&[u8]>,
    ) -> Result<ureq::Response, String> {
        for attempt in 0..2 {
            let mut req = ureq::request(method, url);
            for (k, v) in headers {
                req = req.set(k, v);
            }
            if let Some(t) = self.tokens.get(repo) {
                req = req.set("Authorization", &format!("Bearer {t}"));
            }
            let res = match body {
                Some(b) => req.send_bytes(b),
                None => req.call(),
            };
            match res {
                Ok(resp) => return Ok(resp),
                Err(ureq::Error::Status(401, resp)) if attempt == 0 => {
                    let ch = resp.header("WWW-Authenticate").unwrap_or("").to_string();
                    if ch.to_ascii_lowercase().starts_with("bearer") && self.fetch_token(repo, &ch).is_some() {
                        continue; // retry with the token
                    }
                    return Err("401 unauthorized (registry auth failed)".into());
                }
                Err(ureq::Error::Status(code, resp)) => {
                    return Err(format!("{code} {}", resp.into_string().unwrap_or_default()));
                }
                Err(e) => return Err(format!("registry transport error: {e}")),
            }
        }
        Err("registry request failed".into())
    }

    /// Resolve a reference to its manifest digest (the thing cosign signs). The
    /// digest is ALWAYS recomputed from the served manifest bytes; the registry's
    /// Docker-Content-Digest header and any digest pinned in the ref must match it,
    /// so a hostile/MITM'd registry cannot get us to sign content we did not hash.
    pub fn resolve_digest(&mut self, r: &ImageRef) -> Result<String, String> {
        let url = format!("{}/manifests/{}", r.base(), r.reference);
        let resp = self.send("GET", &url, &r.repo, &[("Accept", MANIFEST_ACCEPT)], None)?;
        let header_digest = resp.header("Docker-Content-Digest").map(|s| s.to_string());
        let mut buf = Vec::new();
        resp.into_reader().read_to_end(&mut buf).map_err(|e| e.to_string())?;
        let computed = sha256_digest(&buf);
        if let Some(h) = &header_digest {
            if !h.eq_ignore_ascii_case(&computed) {
                return Err(format!("registry manifest digest mismatch: header {h} vs computed {computed}"));
            }
        }
        if r.reference.starts_with("sha256:") && !r.reference.eq_ignore_ascii_case(&computed) {
            return Err(format!("requested {} but registry served a manifest hashing to {computed}", r.reference));
        }
        Ok(computed)
    }

    pub fn blob_exists(&mut self, r: &ImageRef, digest: &str) -> bool {
        let url = format!("{}/blobs/{}", r.base(), digest);
        matches!(self.send("HEAD", &url, &r.repo, &[], None), Ok(resp) if resp.status() == 200)
    }

    /// Push a blob (monolithic: POST an upload, then PUT with the digest).
    pub fn push_blob(&mut self, r: &ImageRef, content: &[u8]) -> Result<String, String> {
        let digest = sha256_digest(content);
        if self.blob_exists(r, &digest) {
            return Ok(digest);
        }
        let start = self.send("POST", &format!("{}/blobs/uploads/", r.base()), &r.repo, &[], None)?;
        let loc = start.header("Location").ok_or("no upload Location")?.to_string();
        let mut upload = if loc.starts_with("http") { loc } else { format!("{}://{}{}", r.scheme(), r.registry, loc) };
        upload.push_str(if upload.contains('?') { "&" } else { "?" });
        upload.push_str(&format!("digest={digest}"));
        let resp = self.send("PUT", &upload, &r.repo, &[("Content-Type", "application/octet-stream")], Some(content))?;
        if resp.status() != 201 {
            return Err(format!("blob PUT returned {}", resp.status()));
        }
        Ok(digest)
    }

    /// Push a manifest under a tag; returns its digest.
    pub fn push_manifest(&mut self, r: &ImageRef, tag: &str, manifest: &[u8], media_type: &str) -> Result<String, String> {
        let url = format!("{}/manifests/{}", r.base(), tag);
        let resp = self.send("PUT", &url, &r.repo, &[("Content-Type", media_type)], Some(manifest))?;
        if resp.status() != 201 {
            return Err(format!("manifest PUT returned {}", resp.status()));
        }
        Ok(sha256_digest(manifest))
    }
}

/// The cosign "simple signing" payload signed for an image signature. Keys are
/// emitted in the exact order cosign canonicalizes them.
pub fn simple_signing_payload(registry: &str, repo: &str, manifest_digest: &str) -> Vec<u8> {
    let v = serde_json::json!({
        "critical": {
            "identity": { "docker-reference": format!("{registry}/{repo}") },
            "image": { "docker-manifest-digest": manifest_digest },
            "type": "cosign container image signature",
        },
        "optional": serde_json::Value::Null,
    });
    // serde_json::to_vec sorts object keys? No — preserve insertion via to_string
    // with a canonical layout matching cosign (sorted keys). cosign uses Go's
    // json.Marshal (sorted map keys), so sort here.
    canonical_json(&v).into_bytes()
}

/// Build the `.sig` manifest (config `{}` + one cosign layer carrying the payload
/// with the signature/cert/chain annotations). Returns (manifest_bytes, tag).
pub fn signature_manifest(
    payload_digest: &str,
    payload_len: usize,
    config_digest: &str,
    config_len: usize,
    sig_b64: &str,
    cert_pem: &str,
    chain_pem: &str,
    image_digest: &str,
) -> (Vec<u8>, String) {
    let manifest = serde_json::json!({
        "schemaVersion": 2,
        "mediaType": OCI_MANIFEST,
        "config": { "mediaType": OCI_CONFIG, "digest": config_digest, "size": config_len },
        "layers": [{
            "mediaType": COSIGN_LAYER,
            "digest": payload_digest,
            "size": payload_len,
            "annotations": {
                "dev.cosignproject.cosign/signature": sig_b64,
                "dev.sigstore.cosign/certificate": cert_pem,
                "dev.sigstore.cosign/chain": chain_pem,
            },
        }],
    });
    let bytes = serde_json::to_vec(&manifest).unwrap();
    let tag = format!("sha256-{}.sig", image_digest.trim_start_matches("sha256:"));
    (bytes, tag)
}

/// Build the `.att` manifest: one layer carrying the DSSE envelope, tagged
/// `sha256-<imgdigest>.att`. cosign reads `.att` like `.sig`, so the layer needs
/// the signature + cert annotations even though the sig also lives in the DSSE.
pub fn attestation_manifest(
    dsse_digest: &str,
    dsse_len: usize,
    config_digest: &str,
    config_len: usize,
    sig_b64: &str,
    cert_pem: &str,
    chain_pem: &str,
    predicate_type: &str,
    image_digest: &str,
) -> (Vec<u8>, String) {
    let manifest = serde_json::json!({
        "schemaVersion": 2,
        "mediaType": OCI_MANIFEST,
        "config": { "mediaType": OCI_CONFIG, "digest": config_digest, "size": config_len },
        "layers": [{
            "mediaType": DSSE_LAYER,
            "digest": dsse_digest,
            "size": dsse_len,
            "annotations": {
                "dev.cosignproject.cosign/signature": sig_b64,
                "dev.sigstore.cosign/certificate": cert_pem,
                "dev.sigstore.cosign/chain": chain_pem,
                "predicateType": predicate_type,
            },
        }],
    });
    let bytes = serde_json::to_vec(&manifest).unwrap();
    let tag = format!("sha256-{}.att", image_digest.trim_start_matches("sha256:"));
    (bytes, tag)
}

// Go-compatible canonical JSON: object keys sorted lexicographically. cosign
// verifies the payload it re-marshals, so our bytes must match Go's json.Marshal.
fn canonical_json(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let inner: Vec<String> = keys
                .iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap(), canonical_json(&map[*k])))
                .collect();
            format!("{{{}}}", inner.join(","))
        }
        serde_json::Value::Array(arr) => {
            let inner: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", inner.join(","))
        }
        other => other.to_string(),
    }
}

fn parse_challenge(h: &str) -> HashMap<String, String> {
    // Bearer realm="...",service="...",scope="..."
    let mut out = HashMap::new();
    let body = h.trim_start_matches(|c: char| c.is_alphabetic()).trim();
    for part in split_kv(body) {
        if let Some((k, v)) = part.split_once('=') {
            out.insert(k.trim().to_string(), v.trim().trim_matches('"').to_string());
        }
    }
    out
}

// Split on commas that are not inside quotes.
fn split_kv(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut in_q = false;
    for c in s.chars() {
        match c {
            '"' => { in_q = !in_q; cur.push(c); }
            ',' if !in_q => { parts.push(std::mem::take(&mut cur)); }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() { parts.push(cur); }
    parts
}

fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

use std::io::Read;
