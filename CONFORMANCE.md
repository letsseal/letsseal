# SEAL Conformance Checklist

**For SEAL Version 1.1**, as defined by [SPEC.md](SPEC.md). SPEC.md states no revocation
requirement, so [§5](#5-verifier-revocation) reproduces the reason-code semantics the
Let's Seal CA operates under ([CPS.md](CPS.md) §4.9, version 1.0). An implementation
verifying Let's Seal seals applies those semantics, and a self-hosted CA states its own in
its own policy.

This is the list an independent implementer ticks off to answer one question: **is my
implementation conformant?** Every item below traces to a numbered section of the
specification, given in brackets after the requirement. Where the specification is silent
or admits more than one reading, that is recorded in [Open points](#open-points) at the
end rather than resolved here.

## How to read this document

- The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be
  interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear
  in all capitals, as here.
- Each item cites the section it derives from. Where the specification states a behaviour
  descriptively and this document reads it as normative, the item is listed in
  [Open point 13](#open-points).
- Every requirement carries a stable identifier of the form **C-1**, **C-2**, and so on,
  so a review can cite "C-12" and both parties know which line is meant. One item is
  lettered, **C-3a**, so that adding it left the identifiers around it in place.
- Citations are `[SPEC §n]` for SPEC.md and `[CPS §n]` for CPS.md. Where an item derives
  from a single bullet of a section, the bullet's own wording is quoted after the section
  number, for example `[SPEC §2, "PDF"]`.
- SPEC §12 grants royalty-free implementation of the specification to anyone. The names
  "Let's Seal" and "SEAL" describe conformance to it; C-57 states the constraint that
  carries.

## The two roles

An implementation claims conformance in one or both roles:

- A **VERIFIER** takes an artifact (and, for time, its `.ots`) and reports a verdict. This
  is what most implementers build, so its requirements come first.
- An **ISSUER** produces seals: it holds or obtains a certificate under the published
  root, signs artifacts in their format-native form, anchors them, and publishes the proof.

A verifier claims conformance for the formats it handles. An implementation that verifies
PDFs alone is a conformant SEAL verifier for PDF, and says so: it satisfies the core
requirements C-1 to C-12, C-3a included, and C-14, the PDF block C-15 to C-17, C-26 to
C-31 wherever an anchor is supplied, and the self-test C-58 to C-60, and it names the
formats it covers. C-13 applies where the identity profile is claimed.

Conformance to [§1](#1-verifier-the-core-algorithm) and
[§2](#2-verifier-per-format-requirements) is testable against the vectors in
[§7](#7-self-test). The anchor, log and revocation requirements are stated here ahead of
their fixtures.

---

## 1. Verifier: the core algorithm

The heart of the standard. These apply to every artifact format.

**C-1.** The verifier MUST compute `sha256(file)` over the artifact's complete raw bytes,
and MUST use the lowercase hexadecimal form of that digest wherever a digest is displayed
or used as an identifier. [SPEC §8 step 1, §4]

**C-2.** The verifier MUST locate the seal in the artifact's format-native delivery form:
PAdES embedded in a PDF, C2PA embedded in an image, XML-DSig enveloped in an XML document,
S/MIME for an email message, or a detached CAdES/CMS `.sig` sidecar for any other artifact.
[SPEC §2]

**C-3.** The verifier MUST establish that the signature is cryptographically valid.
[SPEC §8 step 2]

**C-3a.** The verifier MUST establish that the sealed bytes are **intact**: the digest over
the signed byte range still matches the bytes in hand. A signature object can verify while
the bytes it covers have moved, so this is a separate check from C-3, and vectors 002 and
006 are the cases that separate them. [SPEC §8, closing rule]

**C-4.** The verifier MUST establish that the signing certificate chains to a SEAL root it
has pinned by SHA-256 fingerprint, taken from the issuing CA's published location rather
than from an operating system, Adobe, or mail-client trust store. The Let's Seal root is
`CN=Let's Seal Root CA, O=Let's Seal, C=GB`, fingerprint
`02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE`.
A self-hosted deployment pins its own root, and the vectors of [§7](#7-self-test) ask a
verifier to pin `spec/vectors/root.crt`. [SPEC §2, §8 step 2, CPS §9.16]

**C-5.** The verifier MUST establish that the signature's coverage is the **entire file**.
[SPEC §2, §8 step 2]

**C-6.** The verifier MUST report an artifact as **SEAL-authentic** if and only if all four
of C-3a, C-3, C-4 and C-5 hold: intact **and** valid **and** trusted **and** entire-file.
[SPEC §8 step 4 and closing rule; Open point 16]

**C-7.** A valid signature whose certificate fails to chain to the pinned root MUST be
reported as **unrecognised**. Reporting it as authentic is a conformance failure, because
the specification names this exact case a forgery vector. [SPEC §8 step 4]

**C-8.** The verifier MUST NOT render a "pass" verdict from `sealed` or `intact` alone. An
untrusted seal fails. [SPEC §8, closing rule]

**C-9.** The verifier MUST NOT require an RFC-3161 signature timestamp for a verdict. The
timestamp is a convenient second witness to time; the authoritative witness is the anchor
of [§3](#3-verifier-the-anchor). [SPEC §2, "PDF"]

**C-10.** The verifier MUST NOT treat the certificate's subject `CN` or `O` as an
authenticated identity. That label is chosen by the sealing account. [SPEC §2]

**C-11.** The verifier MUST read authenticated issuer identity from the certificate's
`subjectAltName`: a `dNSName` SAN denotes a domain the subscriber proved control of, and a
certificate carrying no `dNSName` SAN denotes a **self-asserted, unverified issuer** whose
integrity and time claims still hold while the issuer name remains a claim. An
organisation certificate also carries a stable `URI:https://letsseal.org/o/<slug>` SAN
identifying its namespace. [SPEC §2, CPS §3.1]

**C-12.** The verifier's presentation of a result MUST NOT imply notarisation or identity
verification. The seal asserts integrity and the sealing certificate. [SPEC §2]

**C-13.** Where the identity profile applies, the presentation MUST use the words
"provider-verified email", and MUST NOT use "verified identity".
[SPEC §7, "Boundary (normative)"]

**C-14.** The verifier MUST reach the verdict of C-6 from the artifact, the pinned root,
and public standards alone, so the proof stands on its own for as long as those three
exist. [SPEC §2, §9, §10]

---

## 2. Verifier: per-format requirements

A verifier satisfies the block for each format it claims.

### 2.1 PDF (PAdES)

**C-15.** The signature MUST be a PAdES signature embedded in the file, covering the
entire file. [SPEC §2, "PDF"]

**C-16.** A signature covering only part of the file, for example where content was
appended after signing by an incremental update, is non-conformant and MUST be reported as
**altered**. [SPEC §2, "PDF"]

**C-17.** C-9 applies to PAdES in particular: the verifier MUST NOT require an RFC-3161
signature timestamp in order to reach a verdict, and the specification places that
timestamp at SHOULD for the issuer (C-50). The PAdES levels above B-T, namely B-LT and
B-LTA, embed chain revocation data drawn from CRL or OCSP endpoints, and SEAL carries
revocation in the published list of [§5](#5-verifier-revocation) instead.
[SPEC §2, "PDF"]

### 2.2 Image (C2PA)

**C-18.** The seal MUST be a C2PA (Content Credentials) signed manifest embedded in the
media file, readable by any C2PA-aware tool. SPEC §2 names jpeg, png, webp, tiff, gif,
avif and heic; the reference sealer accepts those and heif, dng, mp4, quicktime, mp3, flac
and m4a. The covered media set is recorded in [Open point 19](#open-points) rather than
closed here. [SPEC §2, "Image"]

**C-19.** The verifier MUST configure the published SEAL root as a C2PA trust anchor. A
manifest that validates and chains to it is trusted; a manifest that validates while
chaining elsewhere is `Valid` but untrusted, which under C-7 is reported as unrecognised.
[SPEC §2, "Image"]

**C-20.** The verifier MUST take the time claim for a sealed image from the anchor of
[§3](#3-verifier-the-anchor), which is where the C2PA form carries it.
[SPEC §2, "Image"]

### 2.3 XML (XML-DSig)

**C-21.** The seal MUST be an enveloped W3C XML Signature embedded in the document,
carrying the signer's certificate chain in `KeyInfo`, with the signature computed over the
document with the signature element itself excluded (enveloped transform plus C14N). The
verifier MUST pin the published SEAL root as the trust anchor; a signature that validates
and chains to it is trusted, and one that validates while chaining elsewhere is valid but
untrusted. It verifies with stock tooling, for example
`xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml`. [SPEC §2, "XML"]

### 2.4 Email message (S/MIME)

**C-22.** The seal MUST be a `multipart/signed` envelope (RFC 1847) carrying a detached
`application/pkcs7-signature` body per S/MIME 4.0 (RFC 8551), over the message with the
signer's chain embedded. A signature that validates and chains to the pinned root is
trusted; one that validates while chaining elsewhere is valid but untrusted. It verifies
with stock tooling, for example
`openssl smime -verify -in message.eml -CAfile letsseal-root.crt`.
[SPEC §2, "Email message"]

**C-23.** A verifier presenting results inside a desktop mail client MUST describe the
signature as present but untrusted until the published root is imported into that client's
trust store, which is the same pinned-root model as every other SEAL form.
[SPEC §2, "Email message"]

### 2.5 Any other file (detached CAdES/CMS)

**C-24.** The seal MUST be a detached CAdES/CMS `file.sig` sidecar over the file's SHA-256,
with the signer's certificate chain embedded so the sidecar is self-contained. The verifier
MUST hash the file's raw bytes exactly as signed, with no S/MIME text canonicalisation
(LF to CRLF) applied to the content before hashing; with `openssl cms` this is what the
`-binary` flag secures. The reference invocation is
`openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt`.
[SPEC §2, "Any other file"]

---

## 3. Verifier: the anchor

**C-25.** A conforming proof MUST include an OpenTimestamps `.ots` file committing to the
SHA-256 of the sealed document. That is an obligation on the party constructing the proof
(C-51). Where an `.ots` is supplied, the verifier MUST check it against that digest.
[SPEC §3; Open point 3]

**C-26.** The `.ots` MUST commit to a **public, append-only ledger that nobody owns**: one
whose history is written by open participation, readable and checkable by anyone running
ordinary software, and settled beyond the reach of any single party able to rewrite, revoke
or withhold it. An attestation on a ledger governed by a foundation, a consortium, or a
permissioned validator set fails this property, because that governance restores the one
decision this layer exists to remove. [SPEC §3]

**C-27.** The verifier MUST report **confirmed** only on a real `ots verify` against an
attestation on such a ledger. [SPEC §3]

**C-28.** The verifier MUST report **pending** while only a calendar receipt exists, since
a calendar's receipt is a promise to anchor and the attestation has yet to land. Pending
and confirmed MUST be distinguishable in the verifier's output. [SPEC §3]

**C-29.** The verifier MUST read the attestation it finds rather than assuming a
particular ledger. Bitcoin is the profile Let's Seal issues today; the `.ots` format
carries attestations from other ledgers, and a conforming implementation MAY anchor
elsewhere. [SPEC §3]

**C-30.** The verifier MUST treat the anchor as independent proof of time that adds to the
seal, and MUST keep the authenticity verdict of C-6 resting on the seal alone. A confirmed
anchor establishes that the document existed by that block's time. [SPEC §8 steps 3 and 4]

**C-31.** The anchor MUST be checkable with the stock client and no Let's Seal server, for
example `ots verify sealed.pdf.ots` against `sealed.pdf`. [SPEC §3]

---

## 4. Verifier: transparency log

These apply to an implementation that checks the log. Recording a seal in the log is a MAY
for the issuer [SPEC §6], so a verifier claiming log conformance states so explicitly.

**C-32.** The log MUST be an RFC 6962 Merkle tree in which each entry's leaf is
`SHA-256(0x00 ‖ P)`, where `P` is the JSON serialisation of
`{v, sha256, sealType, certCN, ts}` in exactly that key order, `v` being the payload
version and `1` today. The key order is fixed by SPEC.md §6, which this item restates, because a serialisation
that sorts the keys yields a different leaf hash and fails every inclusion proof against
the log. [SPEC §6; Open points 7 and 18]

**C-33.** Interior nodes MUST be `SHA-256(0x01 ‖ left ‖ right)`. [SPEC §6]

**C-34.** The head MUST be a Signed Tree Head `{treeSize, rootHash, timestamp}`, signed by
a dedicated log key whose certificate chains to the SEAL root, over exactly the canonical
bytes `letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`. A verifier checking an STH MUST
reconstruct those bytes byte-for-byte and MUST validate the log key's chain to the pinned
root. [SPEC §6, CPS §7.3]

**C-35.** The log MUST anchor its Signed Tree Head to a public ledger under
[§3](#3-verifier-the-anchor), so the log's history is pinned to a clock outside the
operator's control. A head MAY be served before its anchor lands, in which case its anchor
state MUST be reported, using the vocabulary `none`, `pending` and `confirmed`. A verifier
MAY check a landed anchor by the rules of §3. [SPEC §6]

**C-36.** **Inclusion.** A verifier MUST check an audit proof, obtained for example from
`/api/log/proof?sha256=<hex>`, against an STH of the same `treeSize`, using standard
RFC 6962 arithmetic: recompute the root hash from the leaf and the proof path and compare
it to the STH's `rootHash`. The check MUST rest on that arithmetic rather than on the
server's word. [SPEC §6]

**C-37.** **Consistency.** A verifier MUST check that the log is append-only and never
rewritten by fetching a consistency proof, obtained for example from
`/api/log/consistency?first=&second=`, and verifying by standard RFC 6962 arithmetic that
the tree of size `first` is a prefix of the tree of size `second`. [SPEC §6]

---

## 5. Verifier: revocation

SPEC.md states no revocation requirement. The items below reproduce the reason-code
semantics the Let's Seal CA operates under (CPS.md §4.9, version 1.0), which an
implementation verifying Let's Seal seals applies and which a self-hosted CA states in its
own policy. [Open point 5]

**C-38.** The verifier MUST obtain the revocation list from the published location
(<https://letsseal.org/revocations.json> for the Let's Seal CA). Where the issuing CA
publishes a signature over that list, the verifier SHOULD check it against the signing key
rather than resting on the transport that delivered it, so the list can be fetched once,
cached, and used offline. [CPS §4.9, §2.1; Open point 17]

**C-39.** Each entry carries the certificate serial in lowercase hexadecimal, the subject,
the reason code, the revocation timestamp in UTC, and an optional note, with entries
ordered by revocation time. A verifier MUST match entries by serial against every
certificate in the chain presented by the seal, so that revoking an intermediate withdraws
trust from every certificate issued under it. [CPS §7.2, §4.9, §5.7]

**C-40.** **Reasons that reach backwards.** For `key_compromise`, `ca_compromise` and
`unspecified` the verifier MUST treat every seal made under that certificate as untrusted,
whatever its date. For the two compromise reasons the key was in another party's hands
from a moment nobody can establish; for `unspecified` no ground was recorded, so the safe
reading is that the key may have been exposed, and `ca/setup-ca.sh` emits it as a valid
reason. `ca_compromise` names an intermediate, and by C-39 the match runs over the whole
chain, so it withdraws trust from every certificate issued under that intermediate.
[CPS §4.9, §5.7]

**C-41.** **Reasons that leave earlier seals standing.** For `superseded`,
`cessation_of_operation`, `affiliation_changed` and `privilege_withdrawn`, the verifier
MUST continue to trust seals demonstrably made before the revocation date, because the key
was retired in good order. [CPS §4.9]

**C-42.** Under C-41, the evidence that a seal was made before the revocation date is the
anchor: a confirmed anchor places the seal before a given public-ledger block, checkable
without consulting the CA. A verifier applying C-41 MUST rest the date claim on such
independent evidence. [CPS §4.9]

**C-43.** A reason code the verifier does not recognise MUST be handled as retroactively
invalidating, as `key_compromise` is, since for a trust decision the safe direction is the
strict one. The reference implementation reaches that outcome by recording an unlisted
reason as `unspecified`, which C-40 already treats unconditionally. [CPS §4.9]

---

## 6. Issuer requirements

**C-44.** **Certificate profile.** Certificates MUST be X.509 v3, ECDSA P-256, SHA-256,
with a 128-bit random serial whose high bit is cleared so the DER INTEGER is unambiguously
positive. [CPS §7.1, §4.1]

**C-45.** The signing certificate MUST chain to a published SEAL root, and the issuer MUST
publish that root and its SHA-256 fingerprint in a form a relying party can check.
[SPEC §2, CPS §2.1, §2.2]

**C-46.** The profile MUST match the use: `document` (`critical, CA:FALSE`;
`critical, digitalSignature, nonRepudiation`; EKU `emailProtection`) for documents, images,
XML and email; `code` (`critical, digitalSignature`; EKU `codeSigning`) for software
artifacts and container images; `data` for general attestation; `identity`
(EKU `emailProtection, codeSigning`) for provider-verified identity. [CPS §7.1]

**C-47.** The end-entity certificate used for a C2PA seal MUST meet the C2PA certificate
profile (C2PA 2.x §14.5.1); the SEAL `document` profile satisfies it. [SPEC §2, CPS §7.1]

**C-48.** **Identity in the SAN.** The issuer MUST place authenticated identity in
`subjectAltName`: a `dNSName` SAN only after the subscriber has demonstrated control of
that domain by DNS TXT at `_letsseal-challenge.<domain>` or by confirmation to a recognised
controller alias, and a stable `URI:https://letsseal.org/o/<slug>` SAN on every
organisation certificate. The subject `CN`/`O` remains a subscriber-chosen label.
[SPEC §2, CPS §3.1, §3.2.2]

**C-49.** **Entire-file coverage.** The issuer MUST produce a signature covering the
entire file, in the artifact's format-native delivery form as listed in
[§2](#2-verifier-per-format-requirements). [SPEC §2, §8]

**C-50.** For PDF, the signature SHOULD carry an RFC-3161 signature timestamp (PAdES B-T).
The public TSAs the major CAs run for code signing are sufficient, and a qualified (QTSP)
timestamp is optional at that level. [SPEC §2, "PDF"]

**C-51.** **Anchoring.** The issuer MUST produce an OpenTimestamps `.ots` committing to the
SHA-256 of the sealed document, against a ledger with the property in C-26. [SPEC §3]

**C-52.** **Log submission.** The issuer MAY record each seal in the public, append-only
RFC 6962 transparency log so that mis-issuance is detectable by anyone. A CA operating
under the Let's Seal CPS warrants that it records seals in that log. [SPEC §6, CPS §4.2,
§9.6]

**C-53.** **The proof convention.** Every proof MUST have the canonical permalink
`/d/<sha256>`, the lowercase hex SHA-256 of the sealed file, with a machine-readable twin at
`/api/v1/documents/<sha256>` returning at least `sha256`, `sealed`, `issuer`, `anchor`
(state plus block), and `proof`. A conforming host MAY expose these under its own domain;
the shape is what conforms. [SPEC §4]

**C-54.** **Presentation.** Conforming presentations MUST NOT imply notarisation or
identity verification, and where the identity profile is used MUST say
"provider-verified email". [SPEC §2, §7]

**C-55.** **Supply-chain profile**, where claimed: a blob signature MUST be a raw
ECDSA-P256 signature over the artifact's SHA-256 plus the signer's `codeSigning` leaf in
cosign's flat signature plus certificate form (digest-only); a container image signature
MUST be a cosign simple-signing payload pushed as an OCI image tagged
`sha256-<digest>.sig` beside the image; an attestation MUST be an in-toto v1 statement
whose subject is the artifact SHA-256, in a DSSE envelope over an SPDX, CycloneDX or SLSA
provenance predicate, and MAY be attached to an image as `sha256-<digest>.att`. Each MUST
verify with stock cosign. [SPEC §5]

**C-56.** **Identity profile**, where claimed: the issuer MUST verify the provider's token
with the issuer and audience pinned, the signature checked against the provider's published
JWKS, `email_verified` required, and `alg:none` and HMAC-confusion rejected. On success it
MUST mint a short-lived (about 15 minute) certificate binding the provider-verified email
as a `subjectAltName`, recording the OIDC issuer in the sigstore issuer extension OID
`1.3.6.1.4.1.57264.1.8`, and use it to sign the artifact's SHA-256. [SPEC §7]

**C-57.** **Naming.** An implementation MUST NOT present the names "Let's Seal" or "SEAL"
so as to imply endorsement by the Let's Seal project. Both names describe conformance to
this specification, which SPEC §12 grants anyone the right to implement royalty-free.
[SPEC §12]

---

## 7. Self-test

Test vectors live at [`spec/vectors/`](spec/vectors/) with a `manifest.json` giving the
required verdict for each vector. The reference verifier is
[`spec/verify.py`](spec/verify.py), which validates the chain and full-file coverage
against a pinned root and runs `ots verify`. It pins the published Let's Seal root by
default, and `--root` selects another trust anchor, which is both how a self-hoster points
it at their own root and how the vectors are run:

```
python spec/verify.py sealed.pdf sealed.pdf.ots
python spec/verify.py spec/vectors/001-pades-valid/document.pdf --root spec/vectors/root.crt
```

Every vector is issued by a throwaway CA generated with the suite, so all six require
`--root spec/vectors/root.crt`. The suite covers the seal, which is
[§1](#1-verifier-the-core-algorithm) and [§2](#2-verifier-per-format-requirements) of this
document and §2 and §8 of the specification.
[Open point 15](#open-points) records the fixtures the anchor, log and revocation sections
await.

**C-58.** An implementation claiming conformance MUST reproduce the `require` block
recorded in `spec/vectors/manifest.json` for every vector covering a format it claims,
pinning the suite's `root.crt`, and MUST report which vectors it ran. A field absent from a
vector's `require` block is unconstrained, and an implementation reports it as it sees fit.
[CONFORMANCE §7]

**C-59.** The verdict vocabulary a verifier reports MUST distinguish at least these cases,
which are the outcomes the algorithm defines: **authentic** (C-6); **unrecognised** (C-7,
a signature valid over the bytes in hand whose certificate chains outside the pinned root);
and **altered**, which covers the bytes differing from those sealed (C-3a), the signature
failing to verify over the bytes in hand (C-3), and coverage falling short of the entire
file (C-5, C-16). Vectors 002 and 006 exercise a document whose bytes moved after sealing,
and 004 exercises coverage short of the entire file. Anchor state MUST be reported
separately as **confirmed** or **pending** (C-27, C-28). [SPEC §2, §3, §8]

**C-60.** The negative vectors are the load-bearing ones: an implementation MUST fail a
seal whose certificate chains outside the pinned root (vector 003), MUST fail an artifact
whose bytes differ from those sealed (vectors 002 and 006), and MUST fail a PDF whose
signature covers less than the entire file (vector 004). An implementation MUST also
decline to report a pending anchor as proof of time; that clause is stated ahead of its
fixture, for the reason in [Open point 15](#open-points). An implementation that passes
only the positive vectors has demonstrated nothing about C-7 or C-8. [SPEC §8]

---

## Open points

Places where the specification admits more than one reading. These are recorded rather
than resolved, so an implementer knows where two conformant-looking implementations may
diverge, and so the ambiguity can be closed in a later version.

1. **SPEC §8 step 2 names PAdES alone** ("validate the embedded PAdES signature") while
   §2 defines five delivery forms. The algorithm is read format-generically throughout
   this document, since §8 step 4's rule is stated in terms of valid, trusted and
   entire-file rather than in terms of PDF.
2. **"Coverage is the entire file" for enveloped forms.** §2 spells the rule out for PDF.
   For XML-DSig the signature by construction excludes the signature element (§2 says so),
   and a C2PA manifest sits inside the file it describes, so a literal "entire file" reading
   cannot hold for either. What coverage means for C2PA in particular is undefined.
3. **A proof with no `.ots`.** §3 says a proof MUST include one, while §8 makes
   authenticity turn on step 2 alone. The specification gives no verdict term for a seal
   that is valid, trusted and entire-file but unanchored. The reference verifier runs
   without one and reports "no .ots supplied", which is why C-25 states the `.ots` as an
   obligation on the proof and the check as one a verifier performs on what it is given.
4. **§8 step 3 names Bitcoin** ("a Bitcoin attestation") while §3 says a verifier reads the
   attestation it finds and an implementation MAY anchor elsewhere. §3 is treated as
   governing.
5. **Revocation is absent from SPEC.md.** §8's algorithm has no revocation step, and the
   reference verifier defaults to soft-fail offline. Whether consulting the revocation list
   is required of a conforming verifier, or is an option a verifier declares, is stated
   only in CPS §4.3 and §9.6 and belongs in the specification.
6. **The moment at which certificate validity is judged** is unspecified. The reference
   verifier supports checking at the anchor's proven time and otherwise checks at the
   current time; the two give different answers for a seal made under a since-expired
   certificate, which is exactly the case the anchor exists to settle.
7. **"canonical-JSON" in the §6 leaf is undefined**, while the key order is load-bearing.
   The Let's Seal log serialises `{v, sha256, sealType, certCN, ts}` in that fixed order
   (`web/lib/translog.ts`), which C-32 records, and a canonicalisation that sorts keys,
   RFC 8785 JCS among them, yields a different leaf hash and fails every inclusion proof
   against this log. String escaping, number formatting and separator conventions are open
   on top of that. Naming the serialisation and the key order in §6 would close this.
8. **The STH signature encoding is unspecified.** §6 gives the exact bytes to be signed and
   says a dedicated log key signs them, and leaves the algorithm, the signature encoding,
   and the wire form in which an STH plus its signature are served undefined.
9. **Inclusion proof inputs.** §6 cites `/api/log/proof?sha256=<hex>`; RFC 6962 audit-proof
   arithmetic also needs the leaf index and the tree size, and the response shape carrying
   them is undefined in the specification. The Let's Seal log serves
   `{index, treeSize, leafHash, rootHash, proof[]}` (`web/lib/translog.ts`), with the proof
   pinned to a caller-supplied `treeSize`; naming that shape in §6 would close this.
10. **The `anchor` state vocabulary in the §4 JSON** is given as "state + block" without an
    enumeration. §3 names `confirmed` and `pending`; the log's own heads add `none`
    (C-35), and the reference verifier also emits `unknown`, `error` and `no-ots-client`,
    which the specification does not define.
11. **No verdict term for "no seal present."** §2 gives "altered" and §8 gives
    "unrecognised", and an artifact carrying no signature at all has no named outcome. The
    reference verifier prints "NOT A SEAL".
12. **§8's entire-file rule against the §5 supply-chain forms.** A cosign blob signature is
    digest-only by §5's own words, so "coverage is the entire file" has to mean "over the
    artifact's SHA-256" there. That reconciliation is left implicit.
13. **Behaviours SPEC.md states descriptively, which this document reads as normative.**
    §4's lowercase-hex permalink (C-1); §2's "verifies with stock tooling and no Let's Seal
    server" (C-14, C-21, C-22, C-24); §2's "a conforming verifier configures / pins the
    published SEAL root" (C-19, C-21); §2's note on what a desktop mail client shows
    (C-23); §3's sentence that a proof includes an `.ots` (C-25); §6's sentence that the
    STH is OpenTimestamps-anchored (C-35); and CPS §4.9 and §7.2 on revocation (C-38,
    C-39). C-58 rests on no SPEC.md sentence at all and takes its authority from
    [§7](#7-self-test) of this document. Promoting these sentences to MUSTs in SPEC.md
    would settle each one; until then each is a reading, recorded here.
14. **The intermediate CAs are absent from SPEC.md.** §2 pins the root only, while CPS
    §1.3.1 describes an Intermediate CA and an Identity CA, and the reference verifier ships
    the intermediate as an untrusted helper certificate. Whether a verifier must supply the
    intermediate itself, or expects it in the signature, is unstated.
15. **The vectors cover the seal.** `spec/vectors/` ships six fixtures over SPEC §2 and §8,
    which is [§1](#1-verifier-the-core-algorithm) and
    [§2](#2-verifier-per-format-requirements) of this document. Anchor vectors are absent
    because a confirmed ledger attestation cannot be manufactured offline, and a fabricated
    one would undermine the only thing a conformance suite is for; revocation vectors rest
    on the CPS §4.9 reason semantics and are the next to be written. C-25 to C-31, C-32 to
    C-37 and C-38 to C-43 therefore have fixtures still to come, and C-60's pending-anchor
    clause with them.
16. **SPEC §8 counts the conjuncts two ways.** Step 2 and step 4 name valid, trusted and
    entire-file, while the closing rule names valid, intact and trusted. `spec/verify.py`
    computes `intact and valid and trusted and entire_file`, and
    `spec/vectors/manifest.json` defines authentic the same way. C-6 takes that four-term
    reading, which is the one that catches vector 002, a PDF with one byte of page content
    changed: the manifest requires `intact: false` there and constrains the other fields
    freely, since an implementation may reasonably report the certificate chain as sound
    while the bytes have moved. Under a three-term reading such an implementation calls
    that document authentic. Stating the four terms in one place in §8 would settle this.
17. **The Let's Seal revocation list is served as plain JSON today.** CPS §4.9 describes a
    list carrying its own integrity through a signature by the log key. `ca/setup-ca.sh`
    writes `out/revoked.json` with `version`, `revoked` and `updated_at`;
    `signing-service/revocation.py` `published()` adds `fetched_at`; the endpoint serves
    that over HTTPS. C-38 therefore states the fetch as a MUST and the signature check as a
    SHOULD, and publishing a detached signature over the canonicalised list alongside it
    would let the check become a MUST.
18. **The supply-chain lane appends a second leaf shape.** `web/lib/translog.ts`
    `appendRekorLeaf` takes an exact byte string, a Rekor `hashedrekord` or `dsse` entry
    body, as the leaf preimage, so stock cosign recomputes the same leaf hash. A verifier
    reading the whole log meets both that shape and the §6 metadata payload of C-32, and §6
    describes the second alone.
19. **The media set for C2PA is unsettled.** SPEC §1's table says C2PA is embedded in
    images, video and audio, while §2 lists jpeg, png, webp, tiff, gif, avif and heic. The
    reference sealer accepts those and heif, dng, mp4, quicktime, mp3, flac and m4a. C-18
    states the requirement on the manifest and records the formats, leaving the covered set
    for §2 to settle.
