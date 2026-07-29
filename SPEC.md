# SEAL: Sealed Evidence, Anchored to a Ledger

Version 1.1

## Status of this document

This is version 1.1 of the SEAL specification, published for review.

Review so far has been carried out by the authors and by readers of the public
repository. Third-party review, and review by a standards body, remain ahead of this
document; read the text as a stable description of what is specified and implemented
today, with ratification a matter for that later review.

Comments, corrections and implementation reports are welcome as issues and discussions
at <https://github.com/letsseal/letsseal>.

SEAL is implemented by [Let's Seal](https://letsseal.org), which serves as the reference
implementation of this specification (§10).

## Scope

SEAL specifies how to seal a file of any type so that four properties can be checked
later by a third party using stock tools:

- **Integrity.** The file is byte-for-byte the file that was sealed.
- **Time.** The file existed by a given point on a public, append-only ledger.
- **Issuer.** A named certificate, chaining to a published root, produced the seal.
- **Transparency.** A seal may be entered in an append-only log whose inclusion and
  consistency any party can audit.

The specification covers the format-native delivery forms the seal takes (§2), the
anchor that establishes time (§3), the proof-reference convention (§4), the supply-chain
profile (§5), the log that records seals (§6), the binding of a provider-verified email
to a seal (§7), and the verification algorithm that decides whether a file is
SEAL-authentic (§8).

Attestation of legal identity belongs to the instruments built for it: a notary, or a
qualified trust service provider operating under a scheme such as eIDAS. A SEAL proof
answers what the file is, when it existed, and which certificate sealed it; a party who
additionally requires an attested legal identity obtains it from one of those
instruments and carries it alongside the seal.

## Relationship to existing standards

SEAL composes standards that already exist and are already implemented in shipping
tools. It defines a profile over them: which options to select, which trust anchor to
pin, and how the pieces are carried together. For most components the addition is a
profile decision rather than a new wire format, so a conforming artifact verifies in
third-party software written to the underlying standard, once the relying party has
configured the published SEAL root as its trust anchor.

| Component | Standard profiled | What SEAL adds |
|---|---|---|
| PDF seal | PAdES baseline, ETSI EN 319 142-1, and RFC 3161 | Profile decision: the signature covers the entire file, an incremental update after signing is reported as altered, and trust is pinned to the published SEAL root. The signature is B-B and reaches B-T where an RFC 3161 signature timestamp is obtained; a verifier treats the timestamp as a second witness to time and the anchor as the authoritative one. |
| Image seal | C2PA 2.x (Content Credentials) | Profile decision: an end-entity certificate meeting the C2PA 2.x certificate profile, Section 14.5.1, drawn from the SEAL `document` profile, with the published SEAL root configured as the C2PA trust anchor. |
| XML seal | W3C XML Signature (XML-DSig) | Profile decision: enveloped signature with C14N, the signer's chain in `KeyInfo`, and the published SEAL root as the pinned trust anchor. |
| Email seal | S/MIME, RFC 8551 | Profile decision: a `multipart/signed` message carrying a detached CMS signature with the chain embedded, verified against the pinned root. |
| Generic file seal | CAdES baseline, ETSI EN 319 122-1, over CMS (RFC 5652) | Profile decision: a detached CMS SignedData sidecar (`file.sig`) whose `messageDigest` is the SHA-256 of the file's raw bytes, hashed as-is rather than under S/MIME text canonicalisation, with the signer's chain embedded so the sidecar stands alone. |
| Certificates | X.509, RFC 5280, with RFC 5480 keys and RFC 5758 signature algorithms | Profile decision: EC P-256 with SHA-256, an offline root with two intermediates, as described in the [Let's Seal CPS](https://github.com/letsseal/letsseal/blob/main/CPS.md), the root pinned by SHA-256 fingerprint, and issuer identity read from `subjectAltName` in place of the subject name: a `dNSName` for a domain the issuer has proven control of, a stable `URI` namespace on organisation certificates, and an `rfc822Name` under the identity profile. A certificate carrying no `dNSName` denotes a self-asserted issuer name, with integrity and time unaffected. |
| Transparency log | RFC 6962 Merkle tree, version 1 structure (Section 2.1) | Concrete payloads: the leaf is `SHA-256(0x00 ‖ entry)` where the entry is a canonical-JSON object, and the Signed Tree Head is signed over the fixed byte string `letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n` by a dedicated log key whose certificate chains to the pinned SEAL root, with the STH itself anchored by the mechanism in the Anchor row (§3). Inclusion and consistency arithmetic follow RFC 6962 Sections 2.1.1 and 2.1.2 unchanged; the entry encoding and the Signed Tree Head byte string are defined here. RFC 9162 keeps the same 0x00 and 0x01 prefixes over the same node construction, differing in permitting a negotiated hash function and in the Certificate Transparency leaf payload it defines; this profile fixes SHA-256 and defines its own entry bytes. |
| Anchor | OpenTimestamps | Profile decision: the attestation lands on a public, append-only ledger open to any participant, `confirmed` status follows a real attestation rather than a calendar receipt, and the anchor is the authoritative witness to time. The profile issued today anchors to Bitcoin. |
| Supply-chain artifacts | cosign / Sigstore formats: blob signature, simple signing, and DSSE attestation | Profile decision: the same artifacts issued under the published SEAL root with a `codeSigning` certificate, and entered in the SEAL log where the log profile is offered, so stock `cosign` verifies them against a pinned trust root. The flat sidecar form verifies with cosign's Sigstore-specific transparency and OIDC identity checks disabled by flag; the bundle form verifies against the published SEAL trusted root, with cosign checking inclusion in the SEAL log (§6) as the transparency guarantee. |
| Provenance and SBOM predicates | SLSA v1 provenance, SPDX, CycloneDX, carried as an in-toto v1 Statement in a DSSE envelope | Profile decision: the in-toto subject is the artifact's SHA-256, the same digest the seal and the anchor commit to, and the envelope is signed under the published SEAL root. |

## Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY** and
**OPTIONAL** in this document are to be interpreted as described in BCP 14
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in
all capitals, as shown here. Where those words appear in lower case they carry their
ordinary English meaning.

In addition:

- `‖` denotes concatenation of byte strings.
- SHA-256 digests are written as lowercase hexadecimal unless a colon-separated
  fingerprint is shown.
- Canonical JSON means the members emitted in the key order given where an entry shape
  is defined, with no insignificant whitespace between tokens, encoded as UTF-8 JSON
  [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259). The order is fixed by the shape
  and differs from the lexicographic member ordering that JSON Canonicalization Scheme
  [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) produces, so a leaf preimage is
  generated by emitting the members in the order given. Numbers in the shapes defined
  here are integers, written with no fraction part and no exponent; strings carry the
  escapes RFC 8259 requires, with every other character emitted literally as UTF-8.
- Examples given in shell form are illustrative of a conforming check; any tool that
  performs the equivalent validation conforms.

---

## 1. What a SEAL proof is

A SEAL proof has two independent parts and one convention:

| Letter | Part | Standard used | Proves |
|--------|------|---------------|--------|
| **S**ealed · **E**vidence | A signature by a certificate chaining to a published root CA, in the artifact's format-native form — **PAdES** embedded in PDFs, **C2PA** embedded in images/video/audio, **XML-DSig** enveloped in XML, **S/MIME** for email messages, and **detached CAdES/CMS** (a `file.sig` sidecar) for any other artifact. | PAdES / C2PA / XML-DSig / S/MIME / CAdES (ETSI EN 319 142 / 319 122; C2PA 2.x; W3C XML Signature; RFC 8551), X.509, SHA-256 | **Integrity + issuer** — the file is byte-for-byte what was sealed, and which certificate sealed it. |
| **A**nchored · **L**edger | An OpenTimestamps proof (`.ots`) over the SHA-256 of the sealed file. | OpenTimestamps, Bitcoin | **Time** — the file existed by a given public-ledger block, on a public ledger no one controls. |
| — | The canonical proof permalink `/d/<sha256>` and its machine-readable twin. | HTTP + JSON | **Convention** — one stable way to reference and fetch a proof. |

The proof is **self-contained**: the seal travels inside the artifact (embedded in a
PDF or an image) or beside it as a `.sig`, and the anchor is a small `.ots` sidecar.
Neither requires a database, an account, or Let's Seal being online to verify.

Beyond this core proof, SEAL defines three profiles for broader use, each verifiable
with stock third-party tools: a **supply-chain profile** for software artifacts,
container images, and attestations (§5); a public **transparency log** that makes
mis-issuance detectable (§6); and an **identity profile** binding a provider-verified
email (§7). The core seal + anchor stand alone; the profiles are additive.

---

## 2. The seal (integrity + issuer)

- A conforming artifact MUST carry a signature over its bytes, in its format-native
  delivery form:
  - **PDF — PAdES**, embedded in the file, covering the **entire file**. A signature
    that covers only part of the file (content appended after signing via an
    incremental update) is **not** conformant and MUST be reported as altered.
    The signature SHOULD carry an RFC-3161 signature timestamp (**PAdES B-T**);
    the public TSAs the major CAs run for code signing are sufficient, and no
    qualified (QTSP) timestamp is required for that level. A verifier MUST NOT
    require one: the timestamp is a second, convenient witness to time, and the
    authoritative witness is the anchor (§3), which does not depend on any TSA
    still existing. The levels above B-T (B-LT, B-LTA) embed chain revocation
    data, and are out of scope for an issuer that publishes no CRL or OCSP
    endpoint.
  - **Image — C2PA (Content Credentials)**, a signed manifest embedded in the image
    (jpeg/png/webp/tiff/gif/avif/heic), read by any C2PA-aware tool. The end-entity
    cert MUST meet the C2PA cert profile (C2PA 2.x §14.5.1) — the SEAL `document`
    profile (EC P-256, KU digitalSignature, EKU emailProtection) satisfies it. A
    conforming verifier configures the published SEAL root as a C2PA trust anchor;
    a manifest that validates and chains to it is trusted, one that only validates
    is `Valid` but untrusted. No RFC-3161 timestamp is embedded — time is the anchor.
  - **XML — XML-DSig**, an enveloped W3C XML Signature embedded in the document, with
    the signer's certificate chain in `KeyInfo`, read by any XML Signature tool. The
    signature is over the document with the signature element itself excluded (enveloped
    transform + C14N). A conforming verifier pins the published SEAL root as the trust
    anchor; a signature that validates and chains to it is trusted, one that only
    validates is valid but untrusted. It verifies with stock tooling and no Let's Seal
    server, e.g. `xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml`.
  - **Email message — S/MIME**, a `multipart/signed` envelope (RFC 8551) carrying a
    detached CMS signature over the message, with the signer's chain embedded. Same CMS
    family as the detached seal, in the form mail clients speak. It verifies with stock
    tooling and no Let's Seal server:

    ```
    openssl smime -verify -in message.eml -CAfile letsseal-root.crt
    ```

    A signature that validates and chains to the pinned root is trusted; one that only
    validates is valid but untrusted. Note: a desktop mail client will show the
    signature present but untrusted until the published root is imported into its trust
    store — the same pinned-root model as every other SEAL form (see §2 trailing note).
  - **Any other file — detached CAdES/CMS**, a `file.sig` sidecar signing the file's
    SHA-256. The signer's certificate chain is embedded in the signature, so it is
    self-contained. It verifies with stock tooling and no Let's Seal server:

    ```
    openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt
    ```

    `-binary` is required: it stops `openssl cms` applying S/MIME text
    canonicalisation (LF → CRLF) to the content before hashing. The seal is over
    the file's raw SHA-256, so the raw bytes must be hashed exactly as signed.
- The signing certificate MUST chain to a **published SEAL root**. The root is not in
  any OS, Adobe, or mail-client trust store *by design* — trust is pinned to the
  published root, not granted by a vendor trust list.
- Verifiers pin the root by its SHA-256 fingerprint. The Let's Seal root:

  ```
  Subject:  CN=Let's Seal Root CA, O=Let's Seal, C=GB
  SHA-256:  02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE
  ```
  Download: <https://letsseal.org/api/root-ca> · published at <https://letsseal.org/trust>

- The seal asserts **integrity and the sealing certificate — not real-world identity.**
  Conforming presentations MUST NOT imply notarisation or identity verification.
- **Issuer identity lives in the certificate's `subjectAltName`, not its subject name.**
  The subject `CN`/`O` is a human-readable label chosen by the sealing account and is
  **not** verified — a verifier MUST NOT treat it as an authenticated identity. An
  organisation's authenticated identity is a domain it has proven control of
  (RFC 8555-style DNS or controller-email validation), carried as a `dNSName` SAN on
  the signing certificate. Because a domain is globally unique, it disambiguates
  same-named entities. A certificate that carries **no `dNSName` SAN** denotes a
  **self-asserted, unverified issuer**: the seal's integrity and time claims still hold,
  but the issuer name is a claim, not a verified fact. Every organisation cert also
  carries a stable `URI:https://letsseal.org/o/<slug>` SAN identifying its namespace.

## 3. The anchor (time)

The anchor is what makes the time claim checkable by someone who trusts no party named
in the proof, so the requirement below is a property of the ledger rather than the name
of one.

- The proof MUST include an OpenTimestamps `.ots` file committing to the SHA-256 of the
  sealed document.
- The `.ots` MUST commit to a **public, append-only ledger that nobody owns**: one whose
  history is written by open participation, readable and checkable by anyone running
  ordinary software, and settled beyond the reach of any single party able to rewrite,
  revoke or withhold it. A ledger governed by a foundation, a consortium or a
  permissioned validator set restores the one decision this layer exists to remove.
- **Confirmed** status requires a real `ots verify` against an attestation on such a
  ledger. A calendar's receipt is a promise to anchor, so until the attestation lands
  the anchor is *pending*.
- The profile Let's Seal issues today anchors to Bitcoin, which holds that property and
  the longest continuous public record of holding it. The `.ots` format carries
  attestations from other ledgers, so a conforming implementation MAY anchor elsewhere,
  and a verifier reads the attestation it finds rather than assuming the chain.
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

## 5. Supply-chain profile (software artifacts, images, attestations)

SEAL seals build artifacts, container images, and machine-readable claims about them so
they verify with **stock cosign**, issued under the published SEAL root, a `codeSigning`
certificate, and the SEAL transparency log.

- **Blob signature** — a raw ECDSA-P256 signature over an artifact's SHA-256 plus the
  signer's `codeSigning` leaf, in cosign's flat signature+certificate form.
  Digest-only. Verifies with stock cosign:

  ```
  cosign verify-blob --certificate a.pem --certificate-chain a.chain.pem \
    --signature a.sig --certificate-identity-regexp '.*' \
    --certificate-oidc-issuer-regexp '.*' --insecure-ignore-tlog <artifact>
  ```
- **Container image** — a cosign "simple signing" payload signed and pushed as an OCI
  image tagged `sha256-<digest>.sig` next to the image, so `cosign verify <image>`
  accepts it.
- **Attestation (SBOM / provenance)** — an in-toto v1 statement (subject = artifact
  SHA-256) in a DSSE envelope, over SPDX, CycloneDX, or SLSA provenance predicates:

  ```
  cosign verify-blob-attestation --bundle a.att.bundle --key letsseal.pub \
    --type spdxjson --insecure-ignore-tlog --check-claims=true <artifact>
  ```

  (SLSA v1 predicates use `--type slsaprovenance1`.) An attestation may also be
  attached to an image as `sha256-<digest>.att` for `cosign verify-attestation`.

The `--insecure-ignore-tlog`/`--insecure-ignore-sct` flags skip cosign's built-in
public-log checks; the SEAL transparency log (§6) provides that guarantee. SEAL emits
artifacts stock cosign verifies, issued under its own root, certificates, and log.

## 6. Transparency log (public, append-only registry)

Every seal MAY be recorded in a public, append-only **RFC-6962** Merkle transparency
log, so mis-issuance is detectable by anyone.

- Each entry's leaf is `SHA-256(0x00 ‖ leaf-payload)`, and interior nodes are
  `SHA-256(0x01 ‖ left ‖ right)`, following the version 1 tree structure of RFC 6962 §2.1.
- The **leaf payload** is a JSON object carrying exactly these members, emitted in exactly
  this order:

  ```
  {"v":1,"sha256":"<lowercase hex>","sealType":"<string>","certCN":"<string>","ts":<integer ms>}
  ```

  `v` is the payload version and is `1`. Every member is REQUIRED.
- **Canonicalisation is by fixed member order, not by sorting.** A conforming
  implementation emits the members in the order given above, with no whitespace between
  tokens, encoded as UTF-8. Because the order is fixed by this document rather than
  derived from the member names, the result differs from the lexicographic ordering that
  RFC 8785 produces, and an implementation that sorts will compute a different leaf hash
  and fail every inclusion proof. Strings are escaped as JSON requires, and `ts` is
  serialised as a bare integer number of milliseconds since the Unix epoch.
- The head is a **Signed Tree Head (STH)** `{treeSize, rootHash, timestamp}`, signed by
  a dedicated log key whose certificate chains to the SEAL root, over the canonical
  bytes `letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`. The STH is itself
  OpenTimestamps-anchored to Bitcoin, pinning the log's history to a public clock.
- Anyone verifies **inclusion** with an audit proof at `/api/log/proof?sha256=<hex>`
  against an STH of the same `treeSize`, and **consistency** (append-only, never
  rewritten) with `/api/log/consistency?first=&second=` — standard RFC-6962 math, no
  server trust.

The SEAL log is an independent, third-party-checkable record of every seal, its history
pinned to Bitcoin.

## 7. Identity profile (provider-verified email attribution)

Optionally, a seal MAY bind an email address that a **third-party identity provider
verified at seal time** — attributing a signature to a controllable channel
**without SEAL asserting real-world identity itself.**

- The signer proves control of an email via a standard **OIDC** provider (e.g. Google)
  or GitHub OAuth. The provider's token is verified: issuer + audience pinned,
  signature checked against the provider's published JWKS, `email_verified` required,
  `alg:none` and HMAC-confusion rejected.
- On success a **short-lived (~15-minute) certificate** is minted binding the
  provider-verified email as a `subjectAltName`, with the OIDC issuer recorded in the
  sigstore issuer extension OID `1.3.6.1.4.1.57264.1.8`, and used to sign the
  artifact's SHA-256. It verifies with stock cosign:

  ```
  cosign verify-blob --certificate a.pem --certificate-chain a.chain.pem \
    --signature a.sig --certificate-identity <email> \
    --certificate-oidc-issuer-regexp '.*' --insecure-ignore-tlog <artifact>
  ```
- **Boundary (normative):** this records that *a provider* verified control of that
  email at that moment — attribution by verified channel, **not** notarisation and
  **not** a claim that SEAL verified the person. Conforming presentations MUST say
  "provider-verified email," never "verified identity."

## 8. Verification algorithm (normative)

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

## 9. Trust model

- **Self-anchored.** Verification depends on the published root + public standards + the
  public ledger — not on automatic vendor trust, and not on Let's Seal existing.
- **No identity claim.** SEAL proves *integrity + time*. Attribution of a signing party
  by control-of-channel (e.g. an emailed signing link) is a separate, clearly-labelled
  layer and is **not** identity verification.
- **No lock-in.** The format is open, the root is published, and any tool may implement
  sealing or verification.

## 10. Reference implementation

- **Verifier:** [`spec/verify.py`](spec/verify.py) — a standalone reference verifier. It
  pins the published root, validates the PAdES chain and full-file coverage, and runs
  `ots verify` for the anchor. No Let's Seal server involved. Run it:

  ```
  python spec/verify.py sealed.pdf sealed.pdf.ots
  ```

- **Sealer + service:** the Let's Seal signing + verification service ([`signing-service/`],
  Apache-2.0) implements §2–§8 end-to-end.
- **Supply-chain, identity, and log profiles** verify with third-party tools directly:
  stock `cosign` (§5, §7) and standard RFC-6962 audit-proof checking (§6) — no Let's
  Seal verifier required.

The core verification method in §8 is intentionally small — a standard PAdES/X.509
validator plus the stock OpenTimestamps client is enough to verify a core SEAL proof.

## 11. Versioning

This is **Version 1.1** — Version 1 (PDF/PAdES + OpenTimestamps + the verification
convention) plus additive profiles for the supply chain (§5), a transparency log (§6),
and provider-verified identity (§7); no change to Version 1 conformance. Changes that
alter conformance will bump the version; the profile is expected to stabilise through
real use before any formal standardisation.

## 12. License

**Anyone may implement this specification, royalty-free.** SEAL is published as an
open standard: you may build tools that seal or verify to it, for any purpose,
commercial or not, with no fee, membership, or permission.

- **The specification** (this document) is licensed CC-BY-4.0 — reuse it, quote it,
  translate it, with attribution.
- **The reference implementation** (the Let's Seal signing service, CLI, and SDKs) is
  licensed Apache-2.0, which includes an express patent grant to every implementer.
- **"Let's Seal" and "SEAL"** are the names of the project and the standard; use them
  to describe conformance, not to imply endorsement.
