// sealbot — timestamp any file on Bitcoin and prove it existed, unaltered.
// The "certbot" for document authenticity, as a single static binary.
//
// Composes OpenTimestamps (Bitcoin anchor) + an X.509 CA (seal); it does NOT
// invent the anchoring, and trust is self-anchored (verify via the portal +
// blockchain, not OS/Adobe trust stores).
//
// Core (hash-only, keyless, agent-friendly):
//   sealbot anchor <file> [--publish]   timestamp a file's SHA-256 on Bitcoin
//   sealbot verify <file>               check a sealed PDF, or refresh an .ots
//   sealbot watch  <dir>                notarise a folder continuously
// Advanced (keyed signing — the signing service + a token):
//   sealbot seal   <file> --org <slug>   seal any file with your CA
//     (PDF → embedded PAdES; image/video/audio → embedded C2PA; XML → embedded
//      XML-DSig; anything else → detached CAdES <file>.sig sidecar)
//   sealbot issue  --id <id> --cn "<subject>"  get a signing cert

use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{exit, Command};

fn die(msg: &str) -> ! {
    eprintln!("error: {msg}");
    exit(1);
}

fn flag(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == &format!("--{name}")).and_then(|i| args.get(i + 1).cloned())
}

fn has_flag(name: &str) -> bool {
    std::env::args().any(|a| a == format!("--{name}"))
}

fn env_or(flag_name: &str, env_name: &str, default: &str) -> String {
    flag(flag_name).or_else(|| std::env::var(env_name).ok()).unwrap_or_else(|| default.to_string())
}

fn api() -> String { env_or("api", "SEALBOT_API", "http://127.0.0.1:8081") }
fn app() -> String { env_or("app", "SEALBOT_APP", "http://localhost:3000") }
// The signing service is localhost-bound but still requires a shared bearer.
fn token() -> String { env_or("token", "SEALBOT_TOKEN", "") }

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

fn read(path: &str) -> Vec<u8> {
    std::fs::read(path).unwrap_or_else(|_| die(&format!("cannot read {path}")))
}

fn basename(path: &str) -> String {
    Path::new(path).file_name().and_then(|s| s.to_str()).unwrap_or(path).to_string()
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    base64::engine::general_purpose::STANDARD.decode(s).ok()
}

// ---- HTTP helpers (ureq, blocking, no async runtime) ----

// Build a POST request, attaching the service bearer when `auth` and a token
// are set. App (public) calls pass auth=false; signing-service calls auth=true.
fn req_post(url: &str, auth: bool) -> ureq::Request {
    let r = ureq::post(url);
    let t = token();
    if auth && !t.is_empty() { r.set("Authorization", &format!("Bearer {t}")) } else { r }
}

fn post_json(url: &str, body: serde_json::Value, auth: bool) -> Result<serde_json::Value, String> {
    match req_post(url, auth).send_json(body) {
        Ok(resp) => resp.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, resp)) => Err(format!("{code} {}", resp.into_string().unwrap_or_default())),
        Err(e) => Err(e.to_string()),
    }
}

fn post_multipart(url: &str, fields: &[(&str, &str)], filename: &str, bytes: &[u8], auth: bool) -> Result<ureq::Response, String> {
    let boundary = "----letssealFormBoundary8x2f9q";
    let mut body: Vec<u8> = Vec::new();
    for (k, v) in fields {
        body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").as_bytes());
    }
    body.extend_from_slice(format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
    ).as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let ct = format!("multipart/form-data; boundary={boundary}");
    match req_post(url, auth).set("Content-Type", &ct).send_bytes(&body) {
        Ok(resp) => Ok(resp),
        Err(ureq::Error::Status(code, resp)) => Err(format!("{code} {}", resp.into_string().unwrap_or_default())),
        Err(e) => Err(e.to_string()),
    }
}

// Multipart POST with several file parts (used by detached verify: file + sig).
fn post_multipart_files(url: &str, files: &[(&str, &str, &[u8])], auth: bool) -> Result<ureq::Response, String> {
    let boundary = "----letssealFormBoundary8x2f9q";
    let mut body: Vec<u8> = Vec::new();
    for (field, filename, bytes) in files {
        body.extend_from_slice(format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).as_bytes());
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    let ct = format!("multipart/form-data; boundary={boundary}");
    match req_post(url, auth).set("Content-Type", &ct).send_bytes(&body) {
        Ok(resp) => Ok(resp),
        Err(ureq::Error::Status(code, resp)) => Err(format!("{code} {}", resp.into_string().unwrap_or_default())),
        Err(e) => Err(e.to_string()),
    }
}

fn get_bytes(url: &str) -> Result<Vec<u8>, String> {
    match ureq::get(url).call() {
        Ok(resp) => {
            let mut b = Vec::new();
            resp.into_reader().read_to_end(&mut b).map_err(|e| e.to_string())?;
            Ok(b)
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("{code}")),
        Err(e) => Err(e.to_string()),
    }
}

fn s(v: &serde_json::Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

// ---- Core commands ----

// Register a digest as a public, shareable proof page on the hosted app (keyless).
fn app_anchor(digest: &str, label: &str) -> Result<serde_json::Value, String> {
    post_json(&format!("{}/api/anchor", app()), serde_json::json!({ "sha256": digest, "label": label }), false)
}

fn anchor(file: &str, force_publish: bool) {
    // Hash locally — only the 32-byte digest ever leaves this machine.
    let bytes = read(file);
    let digest = sha256_hex(&bytes);
    let ots_path = format!("{file}.ots");
    let publish = force_publish || has_flag("publish");

    if publish {
        // Public, shareable proof page (keyless); still fetch the portable .ots.
        let r = app_anchor(&digest, &basename(file)).unwrap_or_else(|e| die(&format!("publish failed: {e}")));
        let got_ots = match get_bytes(&format!("{}/api/anchor/{digest}", app())) {
            Ok(b) => std::fs::write(&ots_path, b).is_ok(),
            Err(_) => false,
        };
        let already = r.get("existing").and_then(|x| x.as_bool()).unwrap_or(false);
        println!("anchored  {file}  (published)");
        println!("  sha256  {digest}  (file itself was NOT uploaded)");
        println!("  status  {}{}", s(&r, "state"), if already { " (already on record)" } else { "" });
        println!("  page    {}{}", app(), s(&r, "proof"));
        if got_ots { println!("  proof   {ots_path}  (verify anytime with: ots verify {})", basename(file)); }
        return;
    }

    // Private by default: local .ots only, nothing registered anywhere public.
    let r = post_json(&format!("{}/anchor/hash", api()), serde_json::json!({ "sha256": digest }), true)
        .unwrap_or_else(|e| die(&format!("anchor failed: {e}")));
    let status = r.get("status").cloned().unwrap_or_default();
    let ots = b64_decode(&s(&r, "ots_b64")).unwrap_or_else(|| die("bad .ots from server"));
    std::fs::write(&ots_path, ots).unwrap_or_else(|_| die("cannot write .ots"));
    println!("anchored  {file}");
    println!("  sha256  {digest}  (file itself was NOT uploaded)");
    println!("  status  {}", s(&status, "state"));
    if let Some(b) = status.get("bitcoin_block").and_then(|x| x.as_i64()) { println!("  block   {b}"); }
    println!("  proof   {ots_path}  (verify anytime with: ots verify {})", basename(file));
    println!("  tip     add --publish for a shareable public proof page");
}

// Deprecated: folded into `anchor --publish`. Thin alias, prints a nudge.
fn notarize(file: &str) {
    eprintln!("note: 'notarize' is now 'anchor --publish' — running that.");
    anchor(file, true);
}

// Re-check the calendars for a pending .ots and persist any confirmation.
fn upgrade_ots(ots_path: &str) -> Result<serde_json::Value, String> {
    let ots = read(ots_path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(ots);
    let r = post_json(&format!("{}/anchor/upgrade", api()), serde_json::json!({ "ots_b64": b64 }), true)?;
    if let Some(bytes) = b64_decode(&s(&r, "ots_b64")) {
        std::fs::write(ots_path, bytes).ok();
    }
    Ok(r.get("status").cloned().unwrap_or_default())
}

fn is_pdf(bytes: &[u8]) -> bool {
    bytes.len() >= 5 && &bytes[..5] == b"%PDF-"
}

// A C2PA-embeddable media file, by magic bytes: images (jpeg/png/webp/tiff/gif/
// avif/heic), video (mp4/mov via ISOBMFF ftyp), audio (mp3/flac; m4a via ftyp).
fn is_media(b: &[u8]) -> bool {
    b.len() >= 12
        && (b.starts_with(&[0xFF, 0xD8, 0xFF])                                  // jpeg
            || b.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // png
            || (&b[0..4] == b"RIFF" && &b[8..12] == b"WEBP")                    // webp
            || &b[0..4] == b"II\x2a\x00" || &b[0..4] == b"MM\x00\x2a"           // tiff
            || b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a")            // gif
            || &b[0..4] == b"fLaC"                                              // flac
            || &b[0..3] == b"ID3" || (b[0] == 0xFF && (b[1] & 0xE0) == 0xE0)    // mp3
            || &b[4..8] == b"ftyp")                                             // mp4/mov/m4a/avif/heic
}

// XML if the first non-whitespace byte (after an optional UTF-8 BOM) is '<'.
fn is_xml(b: &[u8]) -> bool {
    let mut i = if b.len() >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF { 3 } else { 0 };
    while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r') { i += 1; }
    i < b.len() && b[i] == b'<'
}

// A signed S/MIME message: the multipart/signed content-type with a pkcs7
// signature protocol sits at the top of the .eml. Used on verify (content-based).
fn is_smime(b: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&b[..b.len().min(4096)]).to_ascii_lowercase();
    head.contains("multipart/signed") && head.contains("pkcs7-signature")
}

// An unsigned mail message to seal, by extension (.eml / .mime).
fn is_eml_name(file: &str) -> bool {
    let (_, ext) = stem_ext(file);
    ext == "eml" || ext == "mime"
}

// Split a path into (stem, ext) on the last dot of the basename, e.g.
// "a/b/photo.JPG" -> ("a/b/photo", "jpg"). ext is lowercased; "" if none.
fn stem_ext(file: &str) -> (String, String) {
    match file.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.contains('/') => (stem.to_string(), ext.to_lowercase()),
        _ => (file.to_string(), String::new()),
    }
}

// Surface a sibling anchor's Bitcoin status too, if a <file>.ots exists.
fn show_sibling_anchor(file: &str) {
    let sib = format!("{file}.ots");
    if Path::new(&sib).exists() {
        if let Ok(status) = upgrade_ots(&sib) {
            let blk = status.get("bitcoin_block").and_then(|x| x.as_i64()).map(|b| format!(" (block {b})")).unwrap_or_default();
            println!("  anchor  {}{}", s(&status, "state"), blk);
        }
    }
}

fn verify(file: &str) {
    // An .ots argument → refresh its Bitcoin confirmation status (was `upgrade`).
    if file.ends_with(".ots") {
        let status = upgrade_ots(file).unwrap_or_else(|e| die(&format!("verify failed: {e}")));
        let state = s(&status, "state");
        println!("{} {file}", if state == "confirmed" { "confirmed" } else { "pending  " });
        if let Some(b) = status.get("bitcoin_block").and_then(|x| x.as_i64()) { println!("  block   {b}"); }
        return;
    }

    let bytes = read(file);
    let sig_path = format!("{file}.sig");
    let has_sig = Path::new(&sig_path).exists();

    // Media (image/video/audio, no .sig) carries its seal embedded as C2PA Content
    // Credentials — verify that. An explicit .sig always takes precedence (detached).
    if is_media(&bytes) && !has_sig {
        let resp = post_multipart(&format!("{}/verify/c2pa", api()), &[], &basename(file), &bytes, true)
            .unwrap_or_else(|e| die(&format!("verify failed: {e}")));
        let r: serde_json::Value = resp.into_json().unwrap_or_else(|_| die("bad response"));
        let sealed = r.get("sealed").and_then(|x| x.as_bool()).unwrap_or(false);
        let valid = r.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
        let trusted = r.get("trusted").and_then(|x| x.as_bool()).unwrap_or(false);
        if !sealed {
            println!("unsealed  {file}  (no Content Credentials found)");
        } else {
            println!("{} {file}", if valid && trusted { "verified " } else { "TAMPERED " });
            println!("  signer  {}", s(&r, "signer").split(',').next().unwrap_or(""));
            println!("  valid   {valid}   trusted {trusted}   (C2PA / Content Credentials)");
            println!("  sha256  {}", s(&r, "sha256"));
        }
        show_sibling_anchor(file);
        if !sealed || !(valid && trusted) { exit(2); }
        return;
    }

    // XML (no .sig) carries an enveloped XML-DSig signature — verify that.
    if is_xml(&bytes) && !has_sig {
        let resp = post_multipart(&format!("{}/verify/xml", api()), &[], &basename(file), &bytes, true)
            .unwrap_or_else(|e| die(&format!("verify failed: {e}")));
        let r: serde_json::Value = resp.into_json().unwrap_or_else(|_| die("bad response"));
        let sealed = r.get("sealed").and_then(|x| x.as_bool()).unwrap_or(false);
        let valid = r.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
        let trusted = r.get("trusted").and_then(|x| x.as_bool()).unwrap_or(false);
        if !sealed {
            println!("unsealed  {file}  (no XML signature found)");
        } else {
            println!("{} {file}", if valid && trusted { "verified " } else { "TAMPERED " });
            println!("  signer  {}", s(&r, "signer").split(',').next().unwrap_or(""));
            println!("  valid   {valid}   trusted {trusted}   (XML-DSig)");
            println!("  sha256  {}", s(&r, "sha256"));
        }
        show_sibling_anchor(file);
        if !sealed || !(valid && trusted) { exit(2); }
        return;
    }

    // A signed S/MIME message (no .sig) carries its multipart/signed signature
    // inline — verify that.
    if is_smime(&bytes) && !has_sig {
        let resp = post_multipart(&format!("{}/verify/smime", api()), &[], &basename(file), &bytes, true)
            .unwrap_or_else(|e| die(&format!("verify failed: {e}")));
        let r: serde_json::Value = resp.into_json().unwrap_or_else(|_| die("bad response"));
        let sealed = r.get("sealed").and_then(|x| x.as_bool()).unwrap_or(false);
        let valid = r.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
        let trusted = r.get("trusted").and_then(|x| x.as_bool()).unwrap_or(false);
        if !sealed {
            println!("unsealed  {file}  (no S/MIME signature found)");
        } else {
            println!("{} {file}", if valid && trusted { "verified " } else { "TAMPERED " });
            println!("  signer  {}", s(&r, "signer").split(',').next().unwrap_or(""));
            println!("  valid   {valid}   trusted {trusted}   (S/MIME)");
            println!("  sha256  {}", s(&r, "sha256"));
        }
        show_sibling_anchor(file);
        if !sealed || !(valid && trusted) { exit(2); }
        return;
    }

    // A detached seal lives beside the file as <file>.sig. Verify it (file + sig)
    // when the .sig is present, or when the file isn't a PDF (so it can't carry an
    // embedded seal) — that's the only way it could be sealed.
    if has_sig || !is_pdf(&bytes) {
        if !has_sig {
            die(&format!("no seal: {file} is not a PDF and {sig_path} was not found"));
        }
        let sig = read(&sig_path);
        let fname = basename(file);
        let sname = basename(&sig_path);
        let resp = post_multipart_files(
            &format!("{}/verify/detached", api()),
            &[("file", &fname, &bytes), ("sig", &sname, &sig)],
            true,
        ).unwrap_or_else(|e| die(&format!("verify failed: {e}")));
        let r: serde_json::Value = resp.into_json().unwrap_or_else(|_| die("bad response"));
        let valid = r.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
        let trusted = r.get("trusted").and_then(|x| x.as_bool()).unwrap_or(false);
        println!("{} {file}", if valid && trusted { "verified " } else { "TAMPERED " });
        println!("  signer  {}", s(&r, "signer").split(',').next().unwrap_or(""));
        println!("  valid   {valid}   trusted {trusted}   (detached seal)");
        println!("  sha256  {}", s(&r, "sha256"));
        show_sibling_anchor(file);
        if !(valid && trusted) { exit(2); }
        return;
    }

    // Otherwise a sealed PDF → check the embedded seal + integrity against the CA.
    let resp = post_multipart(&format!("{}/verify", api()), &[], &basename(file), &bytes, true)
        .unwrap_or_else(|e| die(&format!("verify failed: {e}")));
    let r: serde_json::Value = resp.into_json().unwrap_or_else(|_| die("bad response"));
    let sealed = r.get("sealed").and_then(|x| x.as_bool()).unwrap_or(false);
    let intact = r.get("intact").and_then(|x| x.as_bool()).unwrap_or(false);
    let valid = r.get("valid").and_then(|x| x.as_bool()).unwrap_or(false);
    if !sealed {
        let reason = if s(&r, "reason").is_empty() { "no signature".to_string() } else { s(&r, "reason") };
        println!("unsealed  {file}  ({reason})");
    } else {
        println!("{} {file}", if intact && valid { "verified " } else { "TAMPERED " });
        println!("  signer  {}", s(&r, "signer").split(',').next().unwrap_or(""));
        println!("  intact  {intact}   valid {valid}   trusted {}", r.get("trusted").and_then(|x| x.as_bool()).unwrap_or(false));
        println!("  sha256  {}", s(&r, "sha256"));
    }
    show_sibling_anchor(file);
    if !sealed || !(intact && valid) { exit(2); }
}

// Deprecated: folded into `verify <file>.ots`. Thin alias.
fn upgrade(file: &str) {
    eprintln!("note: 'upgrade' is now 'verify <file>.ots' — running that.");
    verify(file);
}

// ---- watch: turn a directory into an always-on notary ----

fn is_derived(name: &str) -> bool {
    let lower = name.to_lowercase();
    name.ends_with(".ots") || name.ends_with(".sig") || lower.contains(".sealed.")
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match std::fs::read_dir(dir) { Ok(e) => e, Err(_) => return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; } // skip dotfiles (incl. our state/manifest)
        let path = entry.path();
        if path.is_dir() { walk(&path, out); }
        else if path.is_file() && !is_derived(&name) { out.push(path); }
    }
}

// Process one file for `watch`. Returns (sha256, state, proof).
fn process_one(path: &Path, mode: &str, org: &str) -> Result<(String, String, String), String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let digest = sha256_hex(&bytes);
    let full = path.to_string_lossy().to_string();

    match mode {
        "seal" => {
            // PDFs get an embedded PAdES seal; images an embedded C2PA manifest;
            // anything else a detached .sig sidecar.
            if is_pdf(&bytes) {
                let resp = post_multipart(&format!("{}/seal", api()), &[("org_slug", org), ("timestamp", "false")], &basename(&full), &bytes, true)?;
                let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
                let mut out_bytes = Vec::new();
                resp.into_reader().read_to_end(&mut out_bytes).ok();
                let stem = full.strip_suffix(".pdf").or_else(|| full.strip_suffix(".PDF")).unwrap_or(&full);
                let out = format!("{stem}.sealed.pdf");
                std::fs::write(&out, out_bytes).map_err(|e| e.to_string())?;
                Ok((if sha.is_empty() { digest } else { sha }, "sealed".into(), out))
            } else if is_media(&bytes) {
                let title = basename(&full);
                let resp = post_multipart(&format!("{}/seal/c2pa", api()),
                    &[("org_slug", org), ("title", title.as_str())], &title, &bytes, true)?;
                let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
                let mut out_bytes = Vec::new();
                resp.into_reader().read_to_end(&mut out_bytes).ok();
                let (stem, ext) = stem_ext(&full);
                let out = if ext.is_empty() { format!("{stem}.sealed") } else { format!("{stem}.sealed.{ext}") };
                std::fs::write(&out, out_bytes).map_err(|e| e.to_string())?;
                Ok((if sha.is_empty() { digest } else { sha }, "sealed".into(), out))
            } else if is_xml(&bytes) {
                let resp = post_multipart(&format!("{}/seal/xml", api()),
                    &[("org_slug", org)], &basename(&full), &bytes, true)?;
                let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
                let mut out_bytes = Vec::new();
                resp.into_reader().read_to_end(&mut out_bytes).ok();
                let (stem, _) = stem_ext(&full);
                let out = format!("{stem}.sealed.xml");
                std::fs::write(&out, out_bytes).map_err(|e| e.to_string())?;
                Ok((if sha.is_empty() { digest } else { sha }, "sealed".into(), out))
            } else if is_eml_name(&full) {
                let resp = post_multipart(&format!("{}/seal/smime", api()),
                    &[("org_slug", org)], &basename(&full), &bytes, true)?;
                let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
                let mut out_bytes = Vec::new();
                resp.into_reader().read_to_end(&mut out_bytes).ok();
                let (stem, _) = stem_ext(&full);
                let out = format!("{stem}.sealed.eml");
                std::fs::write(&out, out_bytes).map_err(|e| e.to_string())?;
                Ok((if sha.is_empty() { digest } else { sha }, "sealed".into(), out))
            } else {
                let r = post_json(&format!("{}/seal/detached", api()),
                    serde_json::json!({ "sha256": digest, "org_slug": org }), true)?;
                let sig = b64_decode(&s(&r, "sig_b64")).ok_or("bad signature from server")?;
                let out = format!("{full}.sig");
                std::fs::write(&out, sig).map_err(|e| e.to_string())?;
                Ok((digest, "sealed".into(), out))
            }
        }
        "publish" => {
            let r = app_anchor(&digest, &basename(&full))?;
            Ok((digest, s(&r, "state"), format!("{}{}", app(), s(&r, "proof"))))
        }
        _ => {
            // anchor: hash-only, writes a sibling .ots (original untouched).
            let r = post_json(&format!("{}/anchor/hash", api()), serde_json::json!({ "sha256": digest }), true)?;
            let status = r.get("status").cloned().unwrap_or_default();
            let ots_path = format!("{full}.ots");
            if let Some(b) = b64_decode(&s(&r, "ots_b64")) {
                std::fs::write(&ots_path, b).map_err(|e| e.to_string())?;
            }
            Ok((digest, s(&status, "state"), ots_path))
        }
    }
}

fn append_manifest(path: &str, entry: &serde_json::Value) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{entry}");
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn watch(dir: &str) {
    let mut mode = flag("mode").unwrap_or_else(|| "anchor".into());
    if mode == "notarize" { mode = "publish".into(); } // back-compat alias
    if !["anchor", "publish", "seal"].contains(&mode.as_str()) {
        die(&format!("unknown --mode '{mode}' (anchor|publish|seal)"));
    }
    let org = flag("org").unwrap_or_default();
    if mode == "seal" && org.is_empty() { die("seal mode needs --org <slug>"); }
    let interval = flag("interval").and_then(|s| s.parse::<u64>().ok()).unwrap_or(15).max(1);
    let once = has_flag("once");
    let state_path = flag("state").unwrap_or_else(|| format!("{dir}/.sealbot-state.json"));
    let manifest_path = flag("manifest").unwrap_or_else(|| format!("{dir}/.sealbot-manifest.jsonl"));

    let mut state: serde_json::Value = std::fs::read_to_string(&state_path).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .filter(|v: &serde_json::Value| v.is_object())
        .unwrap_or_else(|| serde_json::json!({}));

    let org_note = if org.is_empty() { String::new() } else { format!("  org {org}") };
    println!("watching {dir}");
    println!("  mode {mode}{org_note}   every {interval}s   {}", if once { "(single pass)" } else { "(Ctrl-C to stop)" });

    let mut total_new = 0u64;
    loop {
        let mut files = Vec::new();
        walk(Path::new(dir), &mut files);
        let (mut fresh, mut unchanged, mut failed) = (0u64, 0u64, 0u64);
        for path in &files {
            let rel = path.strip_prefix(dir).unwrap_or(path).to_string_lossy().to_string();
            let meta = match std::fs::metadata(path) { Ok(m) => m, Err(_) => continue };
            let size = meta.len();
            let mtime = meta.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64).unwrap_or(0);
            if let Some(prev) = state.get(&rel) {
                if prev.get("size").and_then(|x| x.as_u64()) == Some(size)
                    && prev.get("mtime").and_then(|x| x.as_u64()) == Some(mtime) {
                    unchanged += 1;
                    continue;
                }
            }
            match process_one(path, &mode, &org) {
                Ok((sha, st, proof)) => {
                    let entry = serde_json::json!({ "ts": now_ms(), "file": rel, "sha256": sha, "mode": mode, "state": st, "proof": proof });
                    let mut stored = entry.clone();
                    stored["size"] = size.into();
                    stored["mtime"] = mtime.into();
                    state[rel.clone()] = stored;
                    append_manifest(&manifest_path, &entry);
                    println!("  + {rel}  → {st}  {proof}");
                    fresh += 1;
                }
                Err(e) if e == "not a PDF" => { unchanged += 1; }
                Err(e) => { eprintln!("  ! {rel}: {e}"); failed += 1; }
            }
        }
        std::fs::write(&state_path, serde_json::to_string_pretty(&state).unwrap_or_default()).ok();
        total_new += fresh;
        if fresh > 0 || failed > 0 {
            let fail_note = if failed > 0 { format!(", {failed} failed") } else { String::new() };
            println!("scan: +{fresh} new, {unchanged} unchanged{fail_note} ({} files)", files.len());
        }
        if once { break; }
        std::thread::sleep(std::time::Duration::from_secs(interval));
    }
    println!("done — {total_new} file(s) {} this run.", if mode == "seal" { "sealed" } else { "anchored" });
}

// ---- Advanced (keyed) commands ----

fn seal(file: &str) {
    let org = flag("org").unwrap_or_else(|| die("usage: sealbot seal <file> --org <slug>"));
    let bytes = read(file);

    // Media (image/video/audio) gets an embedded C2PA (Content Credentials)
    // manifest — the seal lives inside the file, read by any C2PA-aware tool. The
    // file is rewritten, so the bytes are uploaded; a `<stem>.sealed.<ext>` is
    // written beside the original.
    if is_media(&bytes) {
        let title = basename(file);
        let resp = post_multipart(&format!("{}/seal/c2pa", api()),
            &[("org_slug", org.as_str()), ("title", title.as_str())], &title, &bytes, true)
            .unwrap_or_else(|e| die(&format!("seal failed: {e}")));
        let cn = resp.header("x-letsseal-cert-cn").unwrap_or("").to_string();
        let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
        let mut out_bytes = Vec::new();
        resp.into_reader().read_to_end(&mut out_bytes).ok();
        let (stem, ext) = stem_ext(file);
        let out = if ext.is_empty() { format!("{stem}.sealed") } else { format!("{stem}.sealed.{ext}") };
        std::fs::write(&out, out_bytes).unwrap_or_else(|_| die("cannot write signed image"));
        println!("sealed   {out}  (C2PA / Content Credentials)");
        println!("  by     {cn}");
        println!("  sha256 {sha}");
        println!("  verify sealbot verify {out}   (or any C2PA-aware tool)");
        return;
    }

    // XML gets an embedded, enveloped XML-DSig signature — format-native, like the
    // PDF/image paths. The document is rewritten; a `<stem>.sealed.xml` is written.
    if is_xml(&bytes) {
        let resp = post_multipart(&format!("{}/seal/xml", api()),
            &[("org_slug", org.as_str())], &basename(file), &bytes, true)
            .unwrap_or_else(|e| die(&format!("seal failed: {e}")));
        let cn = resp.header("x-letsseal-cert-cn").unwrap_or("").to_string();
        let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
        let mut out_bytes = Vec::new();
        resp.into_reader().read_to_end(&mut out_bytes).ok();
        let (stem, _) = stem_ext(file);
        let out = format!("{stem}.sealed.xml");
        std::fs::write(&out, out_bytes).unwrap_or_else(|_| die("cannot write signed xml"));
        println!("sealed   {out}  (XML-DSig)");
        println!("  by     {cn}");
        println!("  sha256 {sha}");
        println!("  verify sealbot verify {out}   (or any XML Signature tool)");
        return;
    }

    // A mail message (.eml/.mime) gets wrapped in a signed S/MIME multipart/signed
    // envelope — format-native, verifiable by any S/MIME tool. The message is
    // rewritten; a `<stem>.sealed.eml` is written beside the original.
    if is_eml_name(file) {
        let resp = post_multipart(&format!("{}/seal/smime", api()),
            &[("org_slug", org.as_str())], &basename(file), &bytes, true)
            .unwrap_or_else(|e| die(&format!("seal failed: {e}")));
        let cn = resp.header("x-letsseal-cert-cn").unwrap_or("").to_string();
        let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
        let mut out_bytes = Vec::new();
        resp.into_reader().read_to_end(&mut out_bytes).ok();
        let (stem, _) = stem_ext(file);
        let out = format!("{stem}.sealed.eml");
        std::fs::write(&out, out_bytes).unwrap_or_else(|_| die("cannot write signed message"));
        println!("sealed   {out}  (S/MIME)");
        println!("  by     {cn}");
        println!("  sha256 {sha}");
        println!("  verify sealbot verify {out}   (or openssl smime -verify -in {out} -CAfile letsseal-root.crt)");
        return;
    }

    // Any other non-PDF gets a detached CAdES seal beside it (<file>.sig): the file
    // has no slot for an embedded signature, so the seal is a self-contained sidecar.
    // Digest-only — only the SHA-256 leaves this machine, never the file.
    if !is_pdf(&bytes) {
        let digest = sha256_hex(&bytes);
        let r = post_json(&format!("{}/seal/detached", api()),
            serde_json::json!({ "sha256": digest, "org_slug": org }), true)
            .unwrap_or_else(|e| die(&format!("seal failed: {e}")));
        let sig = b64_decode(&s(&r, "sig_b64")).unwrap_or_else(|| die("bad signature from server"));
        let out = format!("{file}.sig");
        std::fs::write(&out, sig).unwrap_or_else(|_| die("cannot write .sig"));
        println!("sealed   {file}  (detached)");
        println!("  by     {}", s(&r, "cert_cn"));
        println!("  sha256 {digest}  (file itself was NOT uploaded)");
        println!("  sig    {out}");
        println!("  verify openssl cms -verify -inform DER -in {out} -content {file} -binary -CAfile letsseal-root.crt");
        return;
    }

    // A PDF gets the seal embedded in place (PAdES).
    let resp = post_multipart(&format!("{}/seal", api()), &[("org_slug", org.as_str()), ("timestamp", "false")], &basename(file), &bytes, true)
        .unwrap_or_else(|e| die(&format!("seal failed: {e}")));
    let cn = resp.header("x-letsseal-cert-cn").unwrap_or("").to_string();
    let sha = resp.header("x-letsseal-sha256").unwrap_or("").to_string();
    let mut out_bytes = Vec::new();
    resp.into_reader().read_to_end(&mut out_bytes).ok();
    let out = format!("{}.sealed.pdf", file.strip_suffix(".pdf").unwrap_or(file));
    std::fs::write(&out, out_bytes).unwrap_or_else(|_| die("cannot write sealed pdf"));
    println!("sealed   {out}");
    println!("  by     {cn}");
    println!("  sha256 {sha}");
}

fn issue() {
    let usage = "usage: sealbot issue --id <id> --cn \"<subject>\" [--profile document|code|data]";
    let id = flag("id").unwrap_or_else(|| die(usage));
    let cn = flag("cn").unwrap_or_else(|| die(usage));
    let profile = flag("profile").unwrap_or_else(|| "document".into());
    let key_path = format!("{id}.key");
    // Generate key + CSR locally with openssl — the private key never leaves here.
    if !Command::new("openssl").args(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", &key_path])
        .status().map(|s| s.success()).unwrap_or(false) {
        die("openssl not found (needed to generate the key locally)");
    }
    let csr = Command::new("openssl").args(["req", "-new", "-key", &key_path, "-subj", &format!("/CN={cn}/O={cn}/C=GB")])
        .output().unwrap_or_else(|_| die("openssl req failed"));
    let csr_pem = String::from_utf8_lossy(&csr.stdout).to_string();
    let r = post_json(&format!("{}/cert/sign", api()), serde_json::json!({ "id": id, "csr": csr_pem, "profile": profile }), true)
        .unwrap_or_else(|e| die(&format!("issue failed: {e}")));
    std::fs::write(format!("{id}.crt"), s(&r, "certificate")).ok();
    std::fs::write(format!("{id}.chain.pem"), s(&r, "chain")).ok();
    println!("issued   {id}  (profile: {})", s(&r, "profile"));
    println!("  key    {key_path}   (kept locally — the CA never saw it)");
    println!("  cert   {id}.crt");
    println!("  chain  {id}.chain.pem");
}

const HELP: &str = "\
sealbot — timestamp any file on Bitcoin and prove it existed, unaltered.

  sealbot anchor <file> [--publish]      hash locally -> writes <file>.ots
                                          (--publish also registers a public proof page)
  sealbot verify <file>                  check a sealed file (PDF, C2PA media, XML, S/MIME .eml, or <file>+.sig), or an .ots
  sealbot watch  <dir> [--mode anchor|publish|seal] [--interval <sec>] [--once]
                                          notarise a folder continuously, idempotently

Advanced — keyed signing (needs the signing service + a bearer token):
  sealbot seal   <file> --org <slug>         seal any file with your CA
                                             (PDF->PAdES; media->C2PA; XML->XML-DSig; .eml->S/MIME; else->.sig)
  sealbot issue  --id <id> --cn \"<subject>\" [--profile document|code|data]

  --api <url>   | SEALBOT_API    signing service (default http://127.0.0.1:8081)
  --app <url>   | SEALBOT_APP    hosted app      (default http://localhost:3000)
  --token <tok> | SEALBOT_TOKEN  bearer for the keyed service

Hash-only by default: the file never leaves your machine, only its 32-byte digest.
Every .ots verifies against Bitcoin with stock `ots verify <file>` — no reliance on
Let's Seal. Composes OpenTimestamps + an X.509 CA; trust is self-anchored.";

fn main() {
    let value_flags = ["--api", "--app", "--token", "--org", "--reason", "--id", "--cn", "--profile", "--mode", "--interval", "--state", "--manifest"];
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut positionals: Vec<String> = Vec::new();
    let mut i = 0;
    while i < raw.len() {
        let a = &raw[i];
        if a.starts_with("--") {
            if value_flags.contains(&a.as_str()) { i += 1; }
        } else {
            positionals.push(a.clone());
        }
        i += 1;
    }
    let cmd = positionals.first().map(|s| s.as_str()).unwrap_or("");
    let arg = positionals.get(1).map(|s| s.as_str()).unwrap_or("");
    match cmd {
        "" | "help" | "--help" => println!("{HELP}"),
        "anchor" => { if arg.is_empty() { die("usage: sealbot anchor <file> [--publish]"); } anchor(arg, false); }
        "verify" => { if arg.is_empty() { die("usage: sealbot verify <file>   (a sealed PDF, or an .ots proof)"); } verify(arg); }
        "watch" => { if arg.is_empty() { die("usage: sealbot watch <dir> [--mode anchor|publish|seal] [--once]"); } watch(arg); }
        "seal" => { if arg.is_empty() { die("usage: sealbot seal <file> --org <slug>"); } seal(arg); }
        "issue" => issue(),
        // Deprecated aliases — still run, with a one-line notice.
        "notarize" => { if arg.is_empty() { die("usage: sealbot anchor <file> --publish"); } notarize(arg); }
        "upgrade" => { if arg.is_empty() { die("usage: sealbot verify <file>.ots"); } upgrade(arg); }
        other => die(&format!("unknown command '{other}'. Run 'sealbot help'.")),
    }
}
