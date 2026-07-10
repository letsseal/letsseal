# Let's Seal signing service — API reference

Base URL (local): `http://127.0.0.1:8081`. The machine-readable contract is
[`openapi.json`](./openapi.json); this is the human summary.

> ⚠️ This service holds signing keys — run it localhost/private only. A public,
> rate-limited tier belongs in the app layer in front of it.

All request/response bodies are JSON unless noted. Errors are
`{"detail": "..."}` with a 4xx/5xx status.

## Sealing

### `POST /seal` — seal a PDF
`multipart/form-data`: `file` (the PDF), `org_slug`, `reason` (default
`"Document execution"`), `timestamp` (bool, default `true`).
**Returns** `application/pdf` (the sealed bytes). Response headers
`X-Letsseal-Sha256` (digest of the sealed PDF) and `X-Letsseal-Cert-CN` (signer).

### `POST /verify` — verify a sealed PDF
`multipart/form-data`: `file`.
**Returns** `VerifyResponse`:
```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "signer": "Common Name: Acme Ltd", "signed_at": "...", "sha256": "..." }
```
`sealed:false` (with `reason`) means no signature was found.

## Anchoring (Bitcoin, via OpenTimestamps)

### `POST /anchor` — anchor a file
`multipart/form-data`: `file`. The file is hashed server-side and discarded.
**Returns** `AnchorResponse` (below).

### `POST /anchor/hash` — anchor a bare digest
JSON `{ "sha256": "<64 hex>" }`. The file never leaves the caller — hash it
yourself and send only the digest. **Returns** `AnchorResponse`.

### `POST /anchor/upgrade` — upgrade a pending proof
JSON `{ "ots_b64": "<base64 .ots>" }`. Asks the calendars whether the Bitcoin
tx confirmed. **Returns** `AnchorResponse` with the (possibly upgraded) proof.

**`AnchorResponse`:**
```json
{ "ots_b64": "<base64 .ots — verifies with stock `ots verify`>",
  "status": { "state": "pending|confirmed", "file_sha256": "...",
              "bitcoin_block": 957186, "calendars": ["https://..."] } }
```

## CA-as-code

### `POST /org` — issue a business signing certificate
JSON `{ "slug": "acme", "legal_name": "Acme Ltd" }`. **Returns**
`{ "ok": true, "slug": "acme" }`.

### `POST /cert/sign` — sign a client CSR
JSON `{ "id": "ci-prod", "csr": "<PEM CSR>", "profile": "document|code|data" }`.
The client generates and keeps the private key; the CA only signs the CSR.
**Returns** `{ "id", "profile", "certificate": "<PEM>", "chain": "<PEM>" }`.

## Utility

### `GET /health` — `{ "ok": true }`

### `POST /qr` — render a proof QR
JSON `{ "data": "<url>" }`. **Returns** `image/png`.

---

**Trust model.** This CA is deliberately *not* in OS/Adobe trust stores. A seal is
verified via its certificate chain + the public portal + the Bitcoin anchor — not
via automatic vendor trust. That is the design, not a limitation.
