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
| **S**ealed · **E**vidence | A signature by a certificate chaining to a published root CA, in the artifact's format-native form: **PAdES** embedded in PDFs, **C2PA** embedded in images/video/audio, **XML-DSig** enveloped in XML, **S/MIME** for email messages, and **detached CAdES/CMS** (a `file.sig` sidecar) for any other artifact. | PAdES / C2PA / XML-DSig / S/MIME / CAdES (ETSI EN 319 142 / 319 122; C2PA 2.x; W3C XML Signature; RFC 8551), X.509, SHA-256 | **Integrity + issuer**: the file is byte-for-byte what was sealed, and which certificate sealed it. |
| **A**nchored · **L**edger | An OpenTimestamps proof (`.ots`) over the SHA-256 of the sealed file. | OpenTimestamps, Bitcoin | **Time**: the file existed by a given public-ledger block, on a public ledger no one controls. |
| Proof convention | The canonical proof permalink `/d/<sha256>` and its machine-readable twin. | HTTP + JSON | **Convention**: one stable way to reference and fetch a proof. |

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
  - **PDF (PAdES)**, embedded in the file, covering the **entire file**. A signature
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
  - **Media (C2PA Content Credentials)**: a signed manifest embedded in the asset and
    read by any C2PA-aware tool. The covered set is jpeg, png, webp, tiff, gif, avif,
    heic, heif and dng for images; mp4 and quicktime for video; and mp3, flac and mp4
    audio for audio. A format belongs in that set only where the manifest's hard binding
    has been shown to detect a change to the payload, rather than merely to embed: a
    container that accepts a manifest while leaving edits undetected would carry a seal
    that means nothing, which is worse than declining the format. That is why avi and wav
    are excluded although a manifest embeds in both, why webm is absent while tooling
    lacks support for it, and why PDF stays with PAdES rather than moving here. An
    implementation MAY cover further formats, and MUST apply the same test before it does.
    The end-entity
    cert MUST meet the C2PA cert profile (C2PA 2.x §14.5.1); the SEAL `document`
    profile (EC P-256, KU digitalSignature, EKU emailProtection) satisfies it. A
    conforming verifier MUST configure the published SEAL root as a C2PA trust anchor;
    a manifest that validates and chains to it is trusted, one that only validates
    is `Valid` but untrusted. No RFC-3161 timestamp is embedded; time is the anchor.
  - **XML (XML-DSig)**, an enveloped W3C XML Signature embedded in the document, with
    the signer's certificate chain in `KeyInfo`, read by any XML Signature tool. The
    signature is over the document with the signature element itself excluded (enveloped
    transform + C14N). A conforming verifier MUST pin the published SEAL root as the trust
    anchor; a signature that validates and chains to it is trusted, one that only
    validates is valid but untrusted. It verifies with stock tooling and no Let's Seal
    server, e.g. `xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml`.
  - **Email message (S/MIME)**, a `multipart/signed` envelope (RFC 8551) carrying a
    detached CMS signature over the message, with the signer's chain embedded. Same CMS
    family as the detached seal, in the form mail clients speak. It verifies with stock
    tooling and no Let's Seal server:

    ```
    openssl smime -verify -in message.eml -CAfile letsseal-root.crt
    ```

    A signature that validates and chains to the pinned root is trusted; one that only
    validates is valid but untrusted. A verifier presenting a result inside a desktop
    mail client MUST describe the signature as present but untrusted until the published
    root has been imported into that client's trust store, which is the same pinned-root
    model as every other SEAL form (see the trailing note to this section).
  - **Any other file (detached CAdES/CMS)**, a `file.sig` sidecar signing the file's
    SHA-256. The signer's certificate chain is embedded in the signature, so it is
    self-contained. It verifies with stock tooling and no Let's Seal server:

    ```
    openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt
    ```

    `-binary` is required: it stops `openssl cms` applying S/MIME text
    canonicalisation (LF → CRLF) to the content before hashing. The seal is over
    the file's raw SHA-256, so the raw bytes must be hashed exactly as signed.
- The signing certificate MUST chain to a **published SEAL root**. The root is not in
  any OS, Adobe, or mail-client trust store *by design*: trust is pinned to the
  published root, not granted by a vendor trust list.
- Verifiers pin the root by its SHA-256 fingerprint. The Let's Seal root:

  ```
  Subject:  CN=Let's Seal Root CA, O=Let's Seal, C=GB
  SHA-256:  02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE
  ```
  Download: <https://letsseal.org/api/root-ca> · published at <https://letsseal.org/trust>

- **A verdict MUST be reachable from the artifact, the pinned root and public standards
  alone.** A verifier MUST NOT require a network call to the issuer, or to any party named
  in the proof, in order to decide whether an artifact is SEAL-authentic. Consulting the
  revocation list (§8.3 step 5) and the anchor (§3) are the two lookups a verifier makes,
  and §8.3 step 5 requires that a list out of reach be reported as `unchecked` rather than
  block the verdict. This is what the per-format examples above mean by verifying with
  stock tooling and no Let's Seal server, and it is the property that lets a proof outlive
  the service that issued it.

- **Only the root is a trust anchor.** A deployment MAY place one or more intermediate
  CAs between the root and the signing certificate, and the Let's Seal CA does: an
  Intermediate CA signs subscriber certificates and a separately constrained Identity CA
  signs the certificates of §7, both directly under the offline root (CPS §1.3.1). An
  intermediate is a link in the path and MUST NOT be pinned as a trust anchor in its own
  right. A verifier handed a bundle of certificates to pin MUST take only the self-signed
  ones as anchors and treat the rest as path-building material: pinning an intermediate
  stops the path there, and the root's signature over that intermediate is never checked.

- **The path MUST be constructible from what the artifact carries.** An issuer MUST make
  every certificate between the signing certificate and the root available to the
  verifier: embedded in the signature for the delivery forms of §2, all of which carry
  certificates, and published beside the artifact for the forms of §5 that carry none,
  where the chain travels as a `.chain.pem` sidecar. A verifier MUST NOT be required to
  obtain an intermediate out of band, and MUST accept a chain supplied beside the
  artifact for the forms that need one.

  A verifier MAY additionally hold known intermediates as path-building material, and the
  reference implementation does. That is a convenience for a seal whose chain arrives
  incomplete, and it changes nothing about trust: the anchor is still the pinned root, and
  a path that reaches an intermediate and stops is not trusted.

- The seal asserts **integrity and the sealing certificate, not real-world identity.**
  Conforming presentations MUST NOT imply notarisation or identity verification.
- **Issuer identity lives in the certificate's `subjectAltName`, not its subject name.**
  The subject `CN`/`O` is a human-readable label chosen by the sealing account and is
  **not** verified, and a verifier MUST NOT treat it as an authenticated identity. An
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

### 3.1 Anchor states

A verifier reports the anchor as exactly one of:

| State | Meaning |
|---|---|
| `confirmed` | An attestation on the ledger commits this digest, and the block it landed in gives the time. |
| `pending` | A calendar has accepted the digest and the attestation has yet to settle. |
| `absent` | No anchor proof was supplied with the artifact. |
| `unverified` | The verifier was unable to check the proof it holds. |

`pending` and `unverified` are separate on purpose. `pending` asserts that a calendar
accepted the digest, which is a claim about the proof. `unverified` asserts nothing beyond
the verifier's own inability to look, so reporting a failed check as `pending` would
manufacture a claim out of a tooling problem.

## 4. The proof convention

- Every proof MUST have a canonical permalink: **`/d/<sha256>`**, and a machine-readable
  twin at **`/api/v1/documents/<sha256>`** returning at least: `sha256`, `sealed`,
  `issuer`, `anchor` (state + block), `proof`.
- `<sha256>` is the SHA-256 of the sealed file in **lowercase hexadecimal**, and an
  implementation MUST use that form wherever a digest appears as an identifier or is
  displayed. A digest is compared as a string more often than as bytes, so one
  implementation emitting uppercase would make two records of the same artifact fail to
  match on a lookup that never checks the bytes at all.
- A conforming host MAY expose these under its own domain; the *shape* is what conforms.

---

## 5. Supply-chain profile (software artifacts, images, attestations)

SEAL seals build artifacts, container images, and machine-readable claims about them so
they verify with **stock cosign**, issued under the published SEAL root, a `codeSigning`
certificate, and the SEAL transparency log.

- **Blob signature**: a raw ECDSA-P256 signature over an artifact's SHA-256 plus the
  signer's `codeSigning` leaf, in cosign's flat signature+certificate form.
  Digest-only. Verifies with stock cosign:

  ```
  cosign verify-blob --certificate a.pem --certificate-chain a.chain.pem \
    --signature a.sig --certificate-identity-regexp '.*' \
    --certificate-oidc-issuer-regexp '.*' --insecure-ignore-tlog <artifact>
  ```
- **Container image**: a cosign "simple signing" payload signed and pushed as an OCI
  image tagged `sha256-<digest>.sig` next to the image, so `cosign verify <image>`
  accepts it.
- **Attestation (SBOM / provenance)**: an in-toto v1 statement (subject = artifact
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
- **A log MAY carry a second leaf shape, and a verifier MUST expect one.** Where a
  deployment offers the supply-chain profile of §5, the entries it appends for those
  artifacts are the exact canonicalised Rekor entry bodies that cosign computes, a
  `hashedrekord` for a blob signature or a `dsse` for an attestation, taken as the leaf
  payload verbatim. That is not an alternative encoding of the object above: it is a
  different payload, and it is used so that stock cosign recomputes the same leaf hash
  from the entry it holds and its inclusion proof checks without a SEAL-specific tool.

  A verifier reading the whole log therefore meets payloads of both shapes and MUST NOT
  assume every leaf parses as the object above. The tree arithmetic is unaffected, because
  a leaf hash is `SHA-256(0x00 ‖ payload)` whatever the payload is, and an inclusion proof
  is checked against the leaf hash rather than against the payload's meaning. A verifier
  that needs to read a payload SHOULD select on its shape rather than assume, and a
  verifier that only checks inclusion needs neither.

  Both shapes commit to one artifact digest, and the two are distinct entries: a blob
  signature and an attestation over the same artifact produce different bodies and so
  occupy different leaves.
- **Canonicalisation is by fixed member order, not by sorting.** A conforming
  implementation emits the members in the order given above, with no whitespace between
  tokens, encoded as UTF-8. Because the order is fixed by this document rather than
  derived from the member names, the result differs from the lexicographic ordering that
  RFC 8785 produces, and an implementation that sorts will compute a different leaf hash
  and fail every inclusion proof. Strings are escaped as JSON requires, and `ts` is
  serialised as a bare integer number of milliseconds since the Unix epoch.
- The head is a **Signed Tree Head (STH)** `{treeSize, rootHash, timestamp}`, signed by
  a dedicated log key whose certificate chains to the SEAL root, over the canonical
  bytes `letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`. A log MUST anchor its STH by
  the mechanism of §3, which pins the log's history to a public clock outside the log
  operator's control. A head MAY be served before its anchor has landed, and where one is,
  the head's own anchor state MUST be reported from the vocabulary of §3.1, so a reader can
  tell a head the ledger has witnessed from one that is so far only asserted.
- The STH signature is **ECDSA on P-256 over SHA-256** of those bytes, DER-encoded and
  carried as base64. It is served with the log certificate and its chain as PEM, so an
  STH is self-contained: a verifier checks the signature against the certificate, and the
  certificate against the pinned root, without fetching anything further.
- The STH is served as JSON carrying at least `treeSize`, `rootHash` (lowercase hex),
  `timestamp` (integer milliseconds), `signature` (base64 DER), `logCert` and `logChain`
  (PEM), and the anchor state of the head itself.
- An inclusion proof is served as JSON carrying `index`, `treeSize`, `leafHash`,
  `rootHash` and `proof` (an ordered array of lowercase-hex sibling hashes). The index and
  the tree size are REQUIRED, because RFC 6962 audit-path arithmetic cannot be performed
  without them.
- Anyone verifies **inclusion** with an audit proof at `/api/log/proof?sha256=<hex>`
  against an STH of the same `treeSize`, and **consistency** (append-only, never
  rewritten) with `/api/log/consistency?first=&second=`, which is standard RFC-6962 math, no
  server trust.

The SEAL log is an independent, third-party-checkable record of every seal, its history
pinned to Bitcoin.

## 7. Identity profile (provider-verified email attribution)

Optionally, a seal MAY bind an email address that a **third-party identity provider
verified at seal time**: attributing a signature to a controllable channel
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
  email at that moment, attribution by verified channel, **not** notarisation and
  **not** a claim that SEAL verified the person. Conforming presentations MUST say
  "provider-verified email," never "verified identity."

## 8. Verification algorithm (normative)

A verifier is given an artifact, and where they exist its detached signature sidecar and
its `.ots` anchor proof.

### 8.1 Facts to establish

The seal establishes four facts. A verifier MUST establish them separately and MUST NOT
collapse them, because each fails for a different reason and a reader acting on the
verdict needs to know which:

| Fact | Established when |
|---|---|
| `intact` | The digest over the signed range equals the artifact in hand. |
| `valid` | The signature verifies under the signing certificate's public key. |
| `trusted` | The signing certificate chains to the pinned SEAL root (§2). |
| `entire_file` | The signature covers the artifact completely, as §8.2 defines completeness for that format. |

`intact` and `valid` are distinct in particular. A signature can verify under its
certificate while the bytes it committed to have changed, so a verifier reading only
`valid` reports tampering as an issuer problem and sends the reader after the wrong thing.

### 8.2 Coverage, per format

Completeness is defined by the format, so the rule is stated per form rather than as one
sentence that fits only PDFs:

| Form | `entire_file` holds when |
|---|---|
| PDF (PAdES) | The signature covers the entire file. Content appended after signing, including by incremental update, leaves it false. |
| Detached (CAdES/CMS) | The signature is over the artifact's digest, so completeness follows from `intact`. |
| XML (XML-DSig) | The signature covers the document with the signature element itself excluded, as the enveloped transform requires. |
| Image (C2PA) | The manifest's hard binding covers the asset as C2PA defines it, with the manifest store excluded. |
| Email (S/MIME) | The signature covers the signed part of the message in full. |
| Supply-chain blob signature (§5) | The signature is over the artifact's digest, so completeness follows from `intact`, as for any detached form. |
| Supply-chain attestation (§5, DSSE) | The signature covers the DSSE pre-authentication encoding in full, and the statement inside it names the artifact by digest, so completeness follows from `intact` for the artifact the statement is about. |

The supply-chain forms of §5 are listed because a verifier meets them and needs the rule,
not because they are a different rule: every one of them signs over a digest, so
`entire_file` follows from `intact` and there is no separate coverage question to answer.
A form whose signature commits to a digest of the whole artifact cannot cover part of it.

### 8.3 Steps

1. **Digest.** Compute `sha256(artifact)`.

2. **Seal.** Validate the format-native signature defined in §2 for this artifact's type,
   and establish the four facts of §8.1.

3. **Certificate validity moment.** Where a **confirmed** anchor (§3) is present, a
   verifier MUST judge certificate validity at the anchored time. Otherwise it judges
   validity at the time of verification, and SHOULD say which it did.

   This is what the anchor is for. Judging a seal against the clock on the day it is
   read would make every seal expire with its certificate, so a five-year certificate
   would carry a five-year evidence horizon and a document sealed correctly in 2026
   would stop verifying in 2031 through nothing but the passage of time.

4. **Anchor.** Verify the `.ots` against the ledger (§3) and report the anchor state from
   the vocabulary in §3.1. The anchor establishes time and contributes no part of
   authenticity.

5. **Revocation.** A verifier MUST consult the issuer's published revocation list where it
   can reach it, and MUST apply the reason semantics that list carries: a compromise
   withdraws trust from every seal under the certificate whatever its date, while an
   orderly retirement leaves seals demonstrably made before the revocation date standing,
   which is a question a confirmed anchor answers. A reason the verifier does not
   recognise is handled as a compromise.

   A verifier reports the revocation state as exactly one of **checked-clear** (the list
   was read and reaches nothing here), **revoked** (an entry reaches this seal), or
   **unchecked** (the list was out of reach, or the certificate could not be identified
   well enough to match against it). A verifier that cannot reach the list MUST report
   **unchecked**, and MUST NOT report checked-clear for a certificate it did not match,
   since that asserts a check which did not happen. Offline
   verification is a property worth keeping, and a verifier reporting `authentic,
   revocation unchecked` has told the truth. Reporting `authentic` while never looking
   has not.

   **The list authenticates itself (§8.5).** Where the list carries a `signature`, a
   verifier MUST check it, and MUST treat a list whose signature does not verify, or
   whose signing certificate does not chain to the pinned root, as **unchecked** rather
   than as a list. That is the honest state: the verifier has no answer it can stand
   behind, and neither reporting checked-clear from bytes nobody vouched for nor
   reporting revoked from them is defensible. A list carrying no signature is consulted
   as it stands, so an issuer that publishes none is still consulted and a verifier
   still reports what it found.

6. **Verdict.** Report exactly one verdict from §8.4.

### 8.4 Verdicts

A conforming verifier reports one of four verdicts, and MUST apply them in this
precedence, because more than one can be true at once and the reason reported should be
the one that applies first:

| Order | Verdict | Reported when |
|---|---|---|
| 1 | `unsealed` | The artifact carries no signature. |
| 2 | `altered` | `intact` is false, or `valid` is false, or `entire_file` is false. |
| 3 | `unrecognised` | The signature is valid over these bytes and the verifier does not accept the certificate that made it: it chains elsewhere than the pinned root, or a revocation reaching this seal has withdrawn trust from it (§8.3 step 5). |
| 4 | `authentic` | `intact` and `valid` and `trusted` and `entire_file` all hold. |

**An artifact is SEAL-authentic if and only if all four facts hold.** A valid signature
from a certificate that does not chain to the pinned root is a forgery vector and MUST be
reported as `unrecognised`. A verifier MUST NOT render a passing verdict from any subset
of the four, and in particular MUST NOT do so from the presence of a signature alone.

The anchor state and the revocation state are reported alongside the verdict rather than
folded into it, so that `authentic, anchor pending` and `authentic, revocation unchecked`
are both sayable.

### 8.5 The published revocation list

The list an issuer publishes for §8.3 step 5 is a JSON object carrying `version` (the
integer `1`), `updated_at` (a UTC timestamp, `YYYY-MM-DDTHH:MM:SSZ`), and `revoked`, an
array ordered by revocation time. Each entry carries exactly `serial` (lowercase
hexadecimal), `subject`, `reason`, `revoked_at` and `note`; a `note` an issuer has nothing
to put in is the empty string. The reason vocabulary and what each reason reaches are the
issuing CA's to state in its policy, and the Let's Seal CA states them in CPS §4.9.

An issuer SHOULD sign the list, and a verifier MUST check the signature where one is
present (§8.3 step 5). The signature is carried in the document itself, so that fetching
the list is enough to check it:

| Member | Meaning |
|---|---|
| `signature` | Base64 of a DER ECDSA-on-P-256 signature over SHA-256 of the bytes below |
| `logCert` | The signing certificate, PEM |
| `logChain` | The certificates between it and the pinned root, PEM |

The signed bytes are the ASCII tag `letsseal.revocations.v1`, a newline, then canonical
JSON of exactly three members in this order:

```
{"version":1,"updated_at":"<timestamp>","revoked":[{"serial":"<hex>","subject":"<dn>","reason":"<reason>","revoked_at":"<timestamp>","note":"<text>"}]}
```

Canonical JSON is as the Conventions define it: members in the order given here, no
insignificant whitespace, UTF-8. The order is fixed by this document rather than derived
from the member names, so an implementation that sorts computes different bytes and every
signature fails.

**The signature covers a reconstruction, not the bytes received.** A verifier parses the
document, rebuilds the bytes above from the values it read, and checks the signature over
the result. That is what lets the list survive being re-encoded by a proxy, a cache or an
archiving tool, and it is why members outside the three signed ones may be added freely: a
publisher MAY include `fetched_at`, and a tool that copies the list into an evidence
bundle MAY wrap it, without invalidating anything. The three signed members, their order,
and the order of the entries within `revoked` are what a signature commits to; reordering
the entries breaks it.

A verifier MUST establish that `logCert` chains to the same pinned root as a seal (§2). A
valid signature from a certificate outside it establishes only that somebody signed a
list.

---

## 9. Trust model

- **Self-anchored.** Verification depends on the published root + public standards + the
  public ledger, not on automatic vendor trust, and not on Let's Seal existing.
- **No identity claim.** SEAL proves *integrity + time*. Attribution of a signing party
  by control-of-channel (e.g. an emailed signing link) is a separate, clearly-labelled
  layer and is **not** identity verification.
- **No lock-in.** The format is open, the root is published, and any tool may implement
  sealing or verification.

## 10. Reference implementation

- **Verifier:** [`spec/verify.py`](spec/verify.py), a standalone reference verifier. It
  pins a published root, establishes the four facts of §8.1 over an embedded PAdES seal or
  a detached CAdES sidecar, runs `ots verify` for the anchor and reports its state from
  §3.1, judges certificate validity at the anchored time where one is confirmed, and
  consults a revocation list where it is given one. No Let's Seal server involved. Run it:

  ```
  python spec/verify.py sealed.pdf sealed.pdf.ots
  python spec/verify.py sealed.pdf --root my-ca.pem --revocations https://example.org/revocations.json
  ```

  `--root` pins a trust anchor other than the published one, which is what a self-hosted
  deployment and the conformance vectors in `spec/vectors/` both need. The C2PA, XML-DSig
  and S/MIME forms verify with the stock third-party tools named in §2.

- **Conformance vectors:** [`spec/vectors/`](spec/vectors/) publishes sealed artifacts
  paired with the verdict a conforming verifier reports for each, with the trust anchor to
  pin and a manifest naming the required result. An implementation claiming conformance
  MUST reproduce that result for every vector covering a format it claims, and MUST state
  which vectors it ran. A conformance claim nobody can reproduce is a statement about
  intent rather than about behaviour, and the negative vectors are the ones that carry the
  weight: reaching a passing verdict is easy, and refusing correctly is the part §8 exists
  for.

- **Sealer + service:** the Let's Seal signing + verification service ([`signing-service/`],
  Apache-2.0) implements §2 to §8 end-to-end.
- **Supply-chain, identity, and log profiles** verify with third-party tools directly:
  stock `cosign` (§5, §7) and standard RFC-6962 audit-proof checking (§6), with no Let's
  Seal verifier required.

The core verification method in §8 is intentionally small: a standard PAdES/X.509
validator plus the stock OpenTimestamps client is enough to verify a core SEAL proof.

## 11. Versioning

This is **Version 1.1**. Version 1 (PDF/PAdES + OpenTimestamps + the verification
convention) plus additive profiles for the supply chain (§5), a transparency log (§6),
and provider-verified identity (§7); no change to Version 1 conformance. Changes that
alter conformance will bump the version; the profile is expected to stabilise through
real use before any formal standardisation.

## 12. License

**Anyone may implement this specification, royalty-free.** SEAL is published as an
open standard: you may build tools that seal or verify to it, for any purpose,
commercial or not, with no fee, membership, or permission.

- **The specification** (this document) is licensed CC-BY-4.0: reuse it, quote it,
  translate it, with attribution.
- **The reference implementation** (the Let's Seal signing service, CLI, and SDKs) is
  licensed Apache-2.0, which includes an express patent grant to every implementer.
- **"Let's Seal" and "SEAL"** are the names of the project and the standard; use them
  to describe conformance, not to imply endorsement.
