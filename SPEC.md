# SEAL — Sealed Evidence, Anchored to a Ledger

**The open standard for proving a document is real.**
Version 1 · published, and implemented by [Let's Seal](https://letsseal.org).

SEAL is an open specification for a self-contained document proof that **anyone can
verify — independently, forever, without Let's Seal.** It does not invent new
cryptography. It defines how to *compose* established standards — PAdES/X.509
signatures and OpenTimestamps — into one artifact and one verification method, so
that a proof made by any conforming tool can be checked by any other.

> **This is a profile of existing standards, not a new protocol.** The value is the
> composition and the convention, published openly and pinned to a public root — not
> novel crypto.

---

## 1. What a SEAL proof is

A SEAL proof has two independent parts and one convention:

| Letter | Part | Standard used | Proves |
|--------|------|---------------|--------|
| **S**ealed · **E**vidence | An AdES signature chaining to a published root CA — **PAdES** embedded in the file for PDFs, **detached CAdES/CMS** (a `file.sig` sidecar) for any other artifact. | PAdES / CAdES (ETSI EN 319 142 / 319 122), X.509, SHA-256 | **Integrity + issuer** — the file is byte-for-byte what was sealed, and which certificate sealed it. |
| **A**nchored · **L**edger | An OpenTimestamps proof (`.ots`) over the SHA-256 of the sealed file. | OpenTimestamps, Bitcoin | **Time** — the file existed by a given public-ledger block, with no authority to trust. |
| — | The canonical proof permalink `/d/<sha256>` and its machine-readable twin. | HTTP + JSON | **Convention** — one stable way to reference and fetch a proof. |

The proof is **self-contained**: the seal travels inside the PDF (or beside any other
file as a `.sig`) and the anchor is a small `.ots` sidecar. Neither requires a
database, an account, or Let's Seal being online to verify.

---

## 2. The seal (integrity + issuer)

- A conforming artifact MUST carry an AdES signature over its bytes, in one of two
  delivery forms:
  - **PDF — PAdES**, embedded in the file, covering the **entire file**. A signature
    that covers only part of the file (content appended after signing via an
    incremental update) is **not** conformant and MUST be reported as altered.
  - **Any other file — detached CAdES/CMS**, a `file.sig` sidecar signing the file's
    SHA-256. The signer's certificate chain is embedded in the signature, so it is
    self-contained. It verifies with stock tooling and no Let's Seal server:

    ```
    openssl cms -verify -inform DER -in file.sig -content file -CAfile letsseal-root.crt
    ```
- The signing certificate MUST chain to a **published SEAL root**. The root is not in
  any OS or Adobe trust store *by design* — trust is pinned to the published root, not
  granted by a vendor trust list.
- The signing certificate MUST chain to a **published SEAL root**. The root is not in
  any OS or Adobe trust store *by design* — trust is pinned to the published root, not
  granted by a vendor trust list.
- Verifiers pin the root by its SHA-256 fingerprint. The Let's Seal root:

  ```
  Subject:  CN=Let's Seal Root CA, O=Let's Seal, C=GB
  SHA-256:  02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE
  ```
  Download: <https://letsseal.org/api/root-ca> · published at <https://letsseal.org/trust>

- The seal asserts **integrity and the sealing certificate — not real-world identity.**
  The certificate's subject name is chosen by the sealing account and is not
  identity-verified. Conforming presentations MUST NOT imply notarisation or identity
  verification.

## 3. The anchor (time)

- The proof MUST include an OpenTimestamps `.ots` file committing to the SHA-256 of the
  sealed document.
- "Confirmed" status requires a real `ots verify` against a Bitcoin attestation — not a
  calendar's pending receipt. Until then the anchor is *pending*.
- Anyone verifies the anchor with the stock client, with no Let's Seal server involved:

  ```
  ots verify sealed.pdf.ots        # (against sealed.pdf)
  ```

## 4. The proof convention

- Every proof has a canonical permalink: **`/d/<sha256>`** (the lowercase hex SHA-256 of
  the sealed file), and a machine-readable twin at **`/api/v1/documents/<sha256>`**
  returning at least: `sha256`, `sealed`, `issuer`, `anchor` (state + block), `proof`.
- A conforming host MAY expose these under its own domain; the *shape* is what conforms.

---

## 5. Verification algorithm (normative)

Given a file (and, for the anchor, its `.ots`):

1. Compute `sha256(file)`.
2. **Seal:** validate the embedded PAdES signature.
   - Signature cryptographically valid, **and**
   - certificate chains to the pinned SEAL root, **and**
   - coverage is the **entire file**.
   - → all three ⇒ *integrity + issuer* established.
3. **Anchor:** `ots verify` the `.ots` against the public ledger.
   - → a Bitcoin attestation ⇒ *existed by that block's time*.
4. A document is **SEAL-authentic** iff step 2 holds (valid **and** trusted **and**
   entire-file). A valid signature from a certificate that does **not** chain to the
   pinned root is a forgery vector and MUST be reported as *unrecognised*, never as
   authentic. The anchor adds independent proof of time.

> **Authentic = valid ∧ intact ∧ trusted.** Never render a "pass" verdict from
> `sealed`/`intact` alone — an untrusted seal must fail.

---

## 6. Trust model

- **Self-anchored.** Verification depends on the published root + public standards + the
  public ledger — not on automatic vendor trust, and not on Let's Seal existing.
- **No identity claim.** SEAL proves *integrity + time*. Attribution of a signing party
  by control-of-channel (e.g. an emailed signing link) is a separate, clearly-labelled
  layer and is **not** identity verification.
- **No lock-in.** The format is open, the root is published, and any tool may implement
  sealing or verification.

## 7. Reference implementation

- **Verifier:** [`spec/verify.py`](spec/verify.py) — a standalone reference verifier. It
  pins the published root, validates the PAdES chain and full-file coverage, and runs
  `ots verify` for the anchor. No Let's Seal server involved. Run it:

  ```
  python spec/verify.py sealed.pdf sealed.pdf.ots
  ```

- **Sealer + service:** the Let's Seal signing + verification service ([`signing-service/`],
  MIT) implements §2–§5 end-to-end.

The verification method in §5 is intentionally small — a standard PAdES/X.509 validator
plus the stock OpenTimestamps client is enough to verify a SEAL proof.

## 8. Versioning

This is **Version 1**. Changes that alter conformance will bump the version; the profile
is expected to stabilise through real use before any formal standardisation. Framed
honestly: SEAL is *an open profile composing PAdES + OpenTimestamps + a verification
convention*, published so the network can converge on one checkable format.
