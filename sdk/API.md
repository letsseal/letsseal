# Let's Seal signing service: API reference

Base URL (local): `http://127.0.0.1:8081`. The machine-readable contract is
[`openapi.json`](./openapi.json); this is the human summary.

> ⚠️ This service holds signing keys, so run it localhost/private only. A public,
> rate-limited tier belongs in the app layer in front of it.

All request/response bodies are JSON unless noted. Errors are
`{"detail": "..."}` with a 4xx/5xx status.

**Seal forms at a glance.** One seal, in the right shape for each file type, and every
one chains to the same published root:

| Endpoint | For | Delivery |
|---|---|---|
| `POST /seal` | PDFs | PAdES signature embedded in the PDF |
| `POST /seal/detached` | any file (digest-only) | detached CAdES/CMS `.sig` sidecar |
| `POST /seal/c2pa` | images, video, audio | C2PA (Content Credentials) embedded in the media |
| `POST /seal/xml` | XML | enveloped W3C XML-DSig signature |
| `POST /seal/smime` | email | S/MIME `multipart/signed` message |
| `POST /seal/blob` | software artifacts (digest-only) | cosign-compatible signature + cert |
| `POST /attest` | SBOM / SLSA provenance (digest-only) | DSSE/in-toto attestation bundle |
| `POST /seal/identity` | any file, under a verified email | short-lived cert bound to a provider-verified email |

Digest-only forms take a SHA-256 you compute locally, so the file's bytes never leave
your machine. Pair any digest-only seal with `/anchor/hash` for the Bitcoin time.

## Sealing

### `POST /seal`: seal a PDF
`multipart/form-data`: `file` (the PDF), `org_slug`, `reason` (default
`"Document execution"`), `timestamp` (bool, default `true`).
**Returns** `application/pdf` (the sealed bytes). Response headers
`X-Letsseal-Sha256` (digest of the sealed PDF) and `X-Letsseal-Cert-CN` (signer).

### `POST /seal/detached`: detached CMS seal over a digest
JSON `{ "sha256": "<64 hex>", "org_slug": "acme" }`. Seals **any file**, and the file
never leaves the caller. **Returns** `{ "sha256", "sig_b64", "cert_cn" }`.

### `POST /verify/detached`: verify a detached seal
`multipart/form-data`: `file`, `sig` (the `.sig`). **Returns**
`{ "sealed", "detached": true, "valid", "trusted", "signer", "sha256" }`.

### `POST /seal/c2pa`: seal an image/media with C2PA
`multipart/form-data`: `file` (image/video/audio), `org_slug`, `title` (optional).
The media is rewritten with an embedded Content Credentials manifest.
**Returns** the signed media (`image/*` etc.); headers `X-Letsseal-Sha256`,
`X-Letsseal-Cert-CN`, `X-Letsseal-Format` (the MIME type).

### `POST /verify/c2pa`: verify embedded Content Credentials
`multipart/form-data`: `file`. **Returns**
`{ "sealed", "c2pa": true, "valid", "trusted", "sha256", ... }`.

### `POST /seal/xml`: seal XML (enveloped XML-DSig)
`multipart/form-data`: `file` (well-formed XML), `org_slug`. The document is
rewritten with an enveloped W3C XML Signature. **Returns** `application/xml`;
headers `X-Letsseal-Sha256`, `X-Letsseal-Cert-CN`.

### `POST /verify/xml`: verify an enveloped XML-DSig
`multipart/form-data`: `file`. **Returns**
`{ "sealed", "xmldsig": true, "valid", "trusted", "sha256", ... }`.

### `POST /seal/smime`: seal an email (S/MIME)
`multipart/form-data`: `file` (an `.eml` / RFC 822 message), `org_slug`.
**Returns** the signed message (`message/rfc822`, a `multipart/signed` envelope);
headers `X-Letsseal-Sha256`, `X-Letsseal-Cert-CN`. Verifies with `openssl smime -verify`.

### `POST /verify/smime`: verify an S/MIME message
`multipart/form-data`: `file`. **Returns**
`{ "sealed", "smime": true, "valid", "trusted", "sha256", ... }`.

### `POST /verify`: verify a sealed PDF
`multipart/form-data`: `file`.
**Returns** `VerifyResponse`:
```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "signer": "Common Name: Acme Ltd", "signed_at": "...", "sha256": "..." }
```
`sealed:false` (with `reason`) means no signature was found.

## Software supply chain

### `POST /seal/blob`: cosign-compatible signature over a digest
JSON `{ "sha256": "<64 hex>", "org_slug": "acme" }` (needs a **code-signing** cert).
**Returns** `{ "sha256", "sig_b64", "cert_pem", "chain_pem", "cert_cn" }`:
cosign's `--signature` / `--certificate` / `--certificate-chain`. Verifies with
stock `cosign verify-blob`, `openssl`, and `sealbot verify`.

### `POST /verify/blob`: verify a cosign-format blob signature
`multipart/form-data`: `file`, `sig` (base64), `cert` (the signer's leaf `.pem`,
the chain to the root is completed server-side, so leaf-only is enough).
**Returns** `{ "sealed", "blob": true, "valid", "trusted", "sha256", ... }`.

### `POST /attest`: sign a DSSE/in-toto attestation
JSON `{ "sha256": "<64 hex>", "org_slug": "acme", "predicate": { ... },
"predicate_type": "spdxjson|cyclonedx|slsaprovenance|vuln|custom | <URI>",
"subject_name": "artifact" }` (needs a code-signing cert). Binds an SBOM / SLSA
provenance / scan to the artifact's digest. **Returns**
`{ "sha256", "bundle", "dsse", "pubkey_pem", "cert_pem", ... }`. The `bundle`
verifies with stock `cosign verify-blob-attestation --bundle att.bundle --key
signer.pub --type <type>`.

### `POST /verify/attest`: verify a DSSE/in-toto attestation
`multipart/form-data`: `file`, `bundle` (the DSSE bundle), `cert` (the signer's leaf
`.pem`, since the chain is completed server-side, so leaf-only is enough). Confirms the
attestation's subject digest matches the uploaded artifact (claims check).
**Returns** `{ "sealed", "attestation": true, "valid", "trusted", "sha256", ... }`.

## Identity (provider-verified email)

### `GET /identity/providers`: enabled providers
**Returns** `{ "providers": ["google", "github", ...] }`: the OIDC providers this
deployment has configured.

### `POST /seal/identity`: seal a digest under a verified identity
JSON `{ "sha256": "<64 hex>", "provider": "google|github|...",
"token": "<OIDC ID token, or a GitHub OAuth access token for github>" }`. The proof
is verified here against the provider, then a short-lived (~15-min) leaf binding the
**provider-verified email** is minted and used to sign the digest. **Returns**
`{ "sha256", "sig_b64", "cert_pem", "chain_pem", "cert_cn" }` (`cert_cn` is the
email). This records that the *provider* verified the signer's email; it is not a
claim of real-world identity.

### `POST /verify/identity`: verify an identity seal
`multipart/form-data`: `file`, `sig` (base64), `cert` (the signer's leaf `.pem`,
the chain is completed server-side, so leaf-only is enough). **Returns** the
verification plus **who** signed (the verified email) and **who vouched** (the OIDC
issuer recorded at issuance).

## Anchoring (Bitcoin, via OpenTimestamps)

### `POST /anchor`: anchor a file
`multipart/form-data`: `file`. The file is hashed server-side and discarded.
**Returns** `AnchorResponse` (below).

### `POST /anchor/hash`: anchor a bare digest
JSON `{ "sha256": "<64 hex>" }`. The file never leaves the caller, so hash it
yourself and send only the digest. **Returns** `AnchorResponse`.

### `POST /anchor/upgrade`: upgrade a pending proof
JSON `{ "ots_b64": "<base64 .ots>" }`. Asks the calendars whether the Bitcoin
tx confirmed. **Returns** `AnchorResponse` with the (possibly upgraded) proof.

**`AnchorResponse`:**
```json
{ "ots_b64": "<base64 .ots, verifies with stock `ots verify`>",
  "status": { "state": "pending|confirmed", "file_sha256": "...",
              "bitcoin_block": 957186, "calendars": ["https://..."] } }
```

## Transparency log

Every seal is recorded in a public, append-only RFC-6962 log owned by the app
layer; these two endpoints let the service sign and publish its head.

### `POST /log/sth/sign`: sign a Signed Tree Head
JSON `{ "tree_size": <int>, "root_hash": "<64 hex>", "ts": <ms> }`. Internal: the
app computes the Merkle root and this authenticates it. **Returns** the signed head.

### `GET /log/cert`: the log's public cert + chain
**Returns** `{ "cert": "<PEM>", "chain": "<PEM>" }` (public, no key), so STH
signatures are self-verifiable.

## CA-as-code

### `POST /org`: issue a business signing certificate
JSON `{ "slug": "acme", "legal_name": "Acme Ltd" }`. **Returns**
`{ "ok": true, "slug": "acme" }`.

### `POST /cert/sign`: sign a client CSR
JSON `{ "id": "ci-prod", "csr": "<PEM CSR>", "profile": "document|code|data" }`.
The client generates and keeps the private key; the CA only signs the CSR.
**Returns** `{ "id", "profile", "certificate": "<PEM>", "chain": "<PEM>" }`.

## Utility

### `GET /health`: `{ "ok": true }`

### `POST /qr`: render a proof QR
JSON `{ "data": "<url>" }`. **Returns** `image/png`.

---

**Trust model.** Trust is self-anchored: a seal verifies against the published
root, the public transparency log, and the Bitcoin anchor, so everything a verifier
needs travels with the proof itself. `trusted` means the seal chains to *this* root.
