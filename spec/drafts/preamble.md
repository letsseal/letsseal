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
