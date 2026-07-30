# SEAL Conformance Checklist

**For SEAL Version 1.1**, as defined by [SPEC.md](SPEC.md). SPEC §8.3 step 5 requires a
verifier to consult the issuer's published revocation list and to apply the reason
semantics that list carries, so [§5](#5-verifier-revocation) states that requirement and
spells out the reason codes the Let's Seal CA operates under ([CPS.md](CPS.md) §4.9,
version 1.0). An implementation verifying Let's Seal seals applies those codes, and a
self-hosted CA states its own in its own policy.

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
requirements C-1 to C-12, C-3a included, C-14, and C-61 to C-63; the PDF block C-15 to
C-17; the anchor requirements C-25 to C-31, applied to the anchor proof it is given, and
C-64 always, since `absent` is the state for an artifact supplied without one; the revocation requirements
C-38 to C-43 and C-68; and the self-test C-58 to C-60, and it names the formats it covers.
C-13 applies where the identity profile is claimed.

Conformance to [§1](#1-verifier-the-core-algorithm) and
[§2](#2-verifier-per-format-requirements) is testable against the vectors in
[§7](#7-self-test). The anchor, log and revocation requirements are stated here ahead of
their fixtures.

---

## 1. Verifier: the core algorithm

The heart of the standard. These apply to every artifact format.

**C-1.** The verifier MUST compute `sha256(file)` over the artifact's complete raw bytes,
and MUST use the lowercase hexadecimal form of that digest wherever a digest is displayed
or used as an identifier. [SPEC §8.3 step 1, §4]

**C-2.** The verifier MUST locate the seal in the artifact's format-native delivery form:
PAdES embedded in a PDF, C2PA embedded in an image, XML-DSig enveloped in an XML document,
S/MIME for an email message, or a detached CAdES/CMS `.sig` sidecar for any other artifact.
The algorithm of SPEC §8.3 is one algorithm over all five forms, and step 2 validates the
format-native signature §2 defines for the artifact in hand. [SPEC §2, §8.3 step 2]

**C-3.** The verifier MUST establish that the signature is **valid**: it verifies under the
signing certificate's public key. The signature validated is the format-native signature
§2 defines for the artifact's type, so the algorithm is one algorithm across all five
forms. [SPEC §8.1, §8.3 step 2]

**C-3a.** The verifier MUST establish that the sealed bytes are **intact**: the digest over
the signed byte range still matches the bytes in hand. A signature object can verify while
the bytes it covers have moved, so this is a separate check from C-3, and vectors 002 and
006 are the cases that separate them. The four facts MUST be established separately and
MUST NOT be collapsed, because each fails for a different reason and a reader acting on the
verdict needs to know which. [SPEC §8.1]

**C-4.** The verifier MUST establish that the signing certificate chains to a SEAL root it
has pinned by SHA-256 fingerprint, taken from the issuing CA's published location rather
than from an operating system, Adobe, or mail-client trust store. The Let's Seal root is
`CN=Let's Seal Root CA, O=Let's Seal, C=GB`, fingerprint
`02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE`.
A self-hosted deployment pins its own root, and the vectors of [§7](#7-self-test) ask a
verifier to pin `spec/vectors/root.crt`. [SPEC §2, §8.1, §8.3 step 2, CPS §9.16]

**C-5.** The verifier MUST establish **`entire_file`**: that the signature covers the
artifact completely, as SPEC §8.2 defines completeness for that artifact's format. C-61
carries the per-format rule. [SPEC §8.1, §8.2]

**C-6.** The verifier MUST report an artifact as **SEAL-authentic** if and only if all four
of C-3a, C-3, C-4 and C-5 hold: intact **and** valid **and** trusted **and** entire-file.
Four conjuncts, and only four. [SPEC §8.1, §8.4]

**C-7.** A valid signature whose certificate chains elsewhere than the pinned root MUST be
reported as **unrecognised**. Reporting it as authentic is a conformance failure, because
the specification names this exact case a forgery vector. [SPEC §8.4]

**C-8.** The verifier MUST NOT render a passing verdict from any subset of the four facts
of C-6, and in particular MUST NOT render one from the presence of a signature alone. An
untrusted seal fails. [SPEC §8.4]

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

**C-14.** The verifier MUST reach the verdict of C-6 from the artifact, the pinned root
and public standards, reporting revocation as `unchecked` where the published list is out
of reach (C-68), so the proof stands on its own for as long as those three exist.
[SPEC §2, §8.3 step 5, §9, §10]

**C-61.** **Coverage, per format.** Completeness is defined by the format, so a verifier
MUST apply the rule for the form in hand:

| Form | `entire_file` holds when |
|---|---|
| PDF (PAdES) | The signature covers the entire file. Content appended after signing, including by incremental update, leaves it false. |
| Detached (CAdES/CMS) | The signature is over the artifact's digest, so completeness follows from `intact`. |
| XML (XML-DSig) | The signature covers the document with the signature element itself excluded, as the enveloped transform requires. |
| Image (C2PA) | The manifest's hard binding covers the asset as C2PA defines it, with the manifest store excluded. |
| Email (S/MIME) | The signature covers the signed part of the message in full. |

[SPEC §8.2]

**C-62.** **Verdicts.** The verifier MUST report exactly one verdict, drawn from this
vocabulary and applied in this precedence, because more than one can be true at once and
the reason reported is the one that applies first:

| Order | Verdict | Reported when |
|---|---|---|
| 1 | `unsealed` | The artifact carries no signature. |
| 2 | `altered` | `intact` is false, or `valid` is false, or `entire_file` is false. |
| 3 | `unrecognised` | The signature is valid over these bytes and the verifier does not accept the certificate that made it: it chains elsewhere than the pinned root (C-7), or a revocation reaching this seal has withdrawn trust from it (C-40 to C-43). |
| 4 | `authentic` | `intact` and `valid` and `trusted` and `entire_file` all hold. |

The anchor state (C-64) and the revocation state (C-68) MUST be reported alongside the
verdict rather than folded into it, so that `authentic, anchor pending` and `authentic,
revocation unchecked` are both sayable. An implementation MAY word these terms for its
audience, and where it does it MUST keep the four cases distinct and MUST keep the
precedence. [SPEC §8.4]

**C-63.** **The moment certificate validity is judged.** Where a **confirmed** anchor is
present, the verifier MUST judge certificate validity at the anchored time. Otherwise it
MUST judge validity at the time of verification, and it SHOULD say which of the two it did.
This is what the anchor is for: judging a seal against the clock on the day it is read
would make every seal expire with its certificate, so a five-year certificate would carry a
five-year evidence horizon and a document sealed correctly in 2026 would stop verifying in
2031 through nothing but the passage of time. [SPEC §8.3 step 3]

---

## 2. Verifier: per-format requirements

A verifier satisfies the block for each format it claims.

### 2.1 PDF (PAdES)

**C-15.** The signature MUST be a PAdES signature embedded in the file, covering the
entire file, which is what `entire_file` means for this form under C-61.
[SPEC §2, "PDF", §8.2]

**C-16.** A signature covering only part of the file, for example where content was
appended after signing by an incremental update, is non-conformant and MUST be reported as
**altered**, the verdict C-62 gives when `entire_file` is false.
[SPEC §2, "PDF", §8.2, §8.4]

**C-17.** C-9 applies to PAdES in particular: the verifier MUST NOT require an RFC-3161
signature timestamp in order to reach a verdict, and the specification places that
timestamp at SHOULD for the issuer (C-50). The PAdES levels above B-T, namely B-LT and
B-LTA, embed chain revocation data drawn from CRL or OCSP endpoints, and SEAL carries
revocation in the published list of [§5](#5-verifier-revocation) instead, which SPEC §8.3
step 5 makes a step of the algorithm. [SPEC §2, "PDF", §8.3 step 5]

### 2.2 Image (C2PA)

**C-18.** The seal MUST be a C2PA (Content Credentials) signed manifest embedded in the
media file, readable by any C2PA-aware tool. SPEC §2 names jpeg, png, webp, tiff, gif,
avif and heic; the reference sealer accepts those and heif, dng, mp4, quicktime, mp3, flac
and m4a. The covered media set is recorded in [Open point 19](#open-points) rather than
closed here. Coverage for this form is the manifest's hard binding over the asset as C2PA
defines it, with the manifest store excluded, which is what `entire_file` means for an
image under C-61. [SPEC §2, "Image", §8.2]

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
`xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml`. Coverage for this form is
the document with the signature element excluded, which is what `entire_file` means for
XML under C-61. [SPEC §2, "XML", §8.2]

### 2.4 Email message (S/MIME)

**C-22.** The seal MUST be a `multipart/signed` envelope (RFC 1847) carrying a detached
`application/pkcs7-signature` body per S/MIME 4.0 (RFC 8551), over the message with the
signer's chain embedded. A signature that validates and chains to the pinned root is
trusted; one that validates while chaining elsewhere is valid but untrusted. It verifies
with stock tooling, for example
`openssl smime -verify -in message.eml -CAfile letsseal-root.crt`. Coverage for this form
is the signed part of the message in full, which is what `entire_file` means for email
under C-61. [SPEC §2, "Email message", §8.2]

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
The signature is over the artifact's digest, so `entire_file` follows from `intact` for
this form under C-61. [SPEC §2, "Any other file", §8.2]

---

## 3. Verifier: the anchor

**C-25.** A conforming proof MUST include an OpenTimestamps `.ots` file committing to the
SHA-256 of the sealed document. That is an obligation on the party constructing the proof
(C-51). Where an `.ots` is supplied, the verifier MUST check it against that digest, and
where none is supplied it MUST report the anchor as `absent` (C-64) beside the verdict,
which C-62 keeps separate from the verdict itself. [SPEC §3, §3.1, §8.4]

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
and confirmed MUST be distinguishable in the verifier's output. A check the verifier was
unable to run is `unverified` rather than `pending`, which C-64 states in full.
[SPEC §3, §3.1]

**C-29.** The verifier MUST read the attestation it finds rather than assuming a
particular ledger. Bitcoin is the profile Let's Seal issues today; the `.ots` format
carries attestations from other ledgers, and a conforming implementation MAY anchor
elsewhere. [SPEC §3]

**C-30.** The verifier MUST treat the anchor as independent proof of time that adds to the
seal, and MUST keep the authenticity verdict of C-6 resting on the seal alone: the anchor
establishes time and contributes no conjunct of the four. A confirmed anchor establishes
that the document existed by that block's time, and that time is the moment certificate
validity is judged under C-63, which is the one place the anchor bears on the seal.
[SPEC §8.3 steps 3 and 4, §8.4]

**C-31.** The anchor MUST be checkable with the stock client and no Let's Seal server, for
example `ots verify sealed.pdf.ots` against `sealed.pdf`. [SPEC §3]

**C-64.** **Anchor states.** The verifier MUST report the anchor as exactly one of four
states, and MUST report it beside the verdict rather than folded into it (C-62):

| State | Reported when |
|---|---|
| `confirmed` | An attestation on the ledger commits this digest, and the block it landed in gives the time. |
| `pending` | A calendar has accepted the digest and the attestation has yet to settle. |
| `absent` | No anchor proof was supplied with the artifact. |
| `unverified` | The verifier was unable to check the proof it holds. |

`pending` and `unverified` are distinct, and a verifier MUST keep them distinct: `pending`
asserts that a calendar accepted the digest, which is a claim about the proof, while
`unverified` asserts only the verifier's own inability to look. A tool failure, a missing
`ots` client or a timeout is therefore `unverified`, since reporting it as `pending` would
manufacture a claim out of a tooling problem. An implementation MAY word these states for
its audience, and where it does it MUST keep the four cases distinct. [SPEC §3.1, §8.3
step 4, §8.4]

---

## 4. Verifier: transparency log

These apply to an implementation that checks the log. Recording a seal in the log is a MAY
for the issuer [SPEC §6], so a verifier claiming log conformance states so explicitly.

**C-32.** The log MUST be an RFC 6962 Merkle tree in which each entry's leaf is
`SHA-256(0x00 ‖ P)`, where `P` is the JSON serialisation of
`{v, sha256, sealType, certCN, ts}` in exactly that key order, `v` being the payload
version and `1` today. The key order is fixed by SPEC.md §6, which this item restates, because a serialisation
that sorts the keys yields a different leaf hash and fails every inclusion proof against
the log. Canonicalisation is by that fixed member order: the members are emitted in the
order given, with no whitespace between tokens, encoded as UTF-8, with `ts` a bare integer
number of milliseconds since the Unix epoch and strings escaped as RFC 8259 requires. An
implementation that sorts the members, as RFC 8785 JCS does, computes a different leaf
hash. [SPEC §6, Conventions; Open point 18]

**C-33.** Interior nodes MUST be `SHA-256(0x01 ‖ left ‖ right)`. [SPEC §6]

**C-34.** The head MUST be a Signed Tree Head `{treeSize, rootHash, timestamp}`, signed by
a dedicated log key whose certificate chains to the SEAL root, over exactly the canonical
bytes `letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`. A verifier checking an STH MUST
reconstruct those bytes byte-for-byte and MUST validate the log key's chain to the pinned
root. C-65 gives the signature algorithm and encoding over those bytes, and C-66 the wire
form they are served in. [SPEC §6, CPS §7.3]

**C-35.** The log MUST anchor its Signed Tree Head to a public ledger under
[§3](#3-verifier-the-anchor), so the log's history is pinned to a clock outside the
operator's control. A head MAY be served before its anchor lands, in which case its anchor
state MUST be reported, drawn from the four states of C-64: `confirmed`, `pending`,
`absent` and `unverified`. A verifier MAY check a landed anchor by the rules of §3.
[SPEC §6, §3.1]

**C-36.** **Inclusion.** A verifier MUST check an audit proof, obtained for example from
`/api/log/proof?sha256=<hex>`, against an STH of the same `treeSize`, using standard
RFC 6962 arithmetic: recompute the root hash from the leaf, the leaf's index and the proof
path, and compare it to the STH's `rootHash`. The inputs that arithmetic needs are the ones
C-67 makes REQUIRED in the proof. The check MUST rest on that arithmetic rather than on the
server's word. [SPEC §6]

**C-37.** **Consistency.** A verifier MUST check that the log is append-only and never
rewritten by fetching a consistency proof, obtained for example from
`/api/log/consistency?first=&second=`, and verifying by standard RFC 6962 arithmetic that
the tree of size `first` is a prefix of the tree of size `second`. [SPEC §6]

**C-65.** **The STH signature.** The signature over the canonical bytes of C-34 MUST be
ECDSA on P-256 over SHA-256 of those bytes, DER-encoded and carried as base64. It MUST be
served with the log certificate and its chain as PEM, so an STH stands on its own: the
verifier checks the signature against the certificate, and the certificate against the
pinned root of C-4, fetching nothing further. [SPEC §6]

**C-66.** **The STH wire form.** An STH MUST be served as JSON carrying at least
`treeSize`, `rootHash` (lowercase hexadecimal), `timestamp` (an integer number of
milliseconds), `signature` (base64 DER, per C-65), `logCert` and `logChain` (PEM), and the
anchor state of the head itself, drawn from the vocabulary of C-64. A verifier reconstructs
the signed bytes of C-34 from `treeSize`, `rootHash` and `timestamp`. [SPEC §6]

**C-67.** **The inclusion proof wire form.** An inclusion proof MUST be served as JSON
carrying `index`, `treeSize`, `leafHash`, `rootHash` and `proof`, an ordered array of
lowercase-hexadecimal sibling hashes. `index` and `treeSize` are REQUIRED, because RFC 6962
audit-path arithmetic is performed with them and cannot be performed without them.
[SPEC §6]

---

## 5. Verifier: revocation

SPEC §8.3 step 5 makes revocation a step of the verification algorithm: a verifier MUST
consult the issuer's published revocation list where it can reach it, MUST apply the reason
semantics that list carries, and MUST report revocation as unchecked where the list is out
of reach (C-68). A seal a revocation reaches is not authentic, because `trusted` is false,
and the verdict it earns is `unrecognised` (C-62). The items below carry that requirement
and reproduce the concrete reason codes the Let's Seal CA operates under (CPS.md §4.9,
version 1.0), which an implementation verifying Let's Seal seals applies and which a
self-hosted CA states in its own policy.

**C-38.** The verifier MUST obtain the revocation list from the published location
(<https://letsseal.org/revocations.json> for the Let's Seal CA). Where the issuing CA
publishes a signature over that list, the verifier SHOULD check it against the signing key
rather than resting on the transport that delivered it, so the list can be fetched once,
cached, and used offline. [SPEC §8.3 step 5, CPS §4.9, §2.1; Open point 17]

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
chain, so it withdraws trust from every certificate issued under that intermediate. This is
SPEC §8.3 step 5's rule that a compromise reaches every seal under the certificate whatever
its date. [SPEC §8.3 step 5, CPS §4.9, §5.7]

**C-41.** **Reasons that leave earlier seals standing.** For `superseded`,
`cessation_of_operation`, `affiliation_changed` and `privilege_withdrawn`, the verifier
MUST continue to trust seals demonstrably made before the revocation date, because the key
was retired in good order. This is SPEC §8.3 step 5's rule that an orderly retirement
leaves seals demonstrably made before the revocation date standing.
[SPEC §8.3 step 5, CPS §4.9]

**C-42.** Under C-41, the evidence that a seal was made before the revocation date is the
anchor: a confirmed anchor places the seal before a given public-ledger block, checkable
without consulting the CA. A verifier applying C-41 MUST rest the date claim on such
independent evidence, which is the question SPEC §8.3 step 5 says a confirmed anchor
answers. [SPEC §8.3 step 5, CPS §4.9]

**C-43.** A reason code the verifier does not recognise MUST be handled as a compromise,
retroactively invalidating as `key_compromise` is, since for a trust decision the safe
direction is the strict one. The reference implementation reaches that outcome by recording
an unlisted reason as `unspecified`, which C-40 already treats unconditionally.
[SPEC §8.3 step 5, CPS §4.9]

**C-68.** **Revocation reported, including when it was out of reach.** A verifier that
cannot reach the published list MUST report revocation as **unchecked**, and MUST report
the revocation state beside the verdict rather than folded into it (C-62). Offline
verification stays a conformant way to verify: a verifier reporting `authentic, revocation
unchecked` has told the reader what it did. Reporting `authentic` while never looking, or
while a fetch failed silently, is a conformance failure. A verifier that did reach the list
and matched no entry against the chain reports the state its vocabulary gives for a clear
check, which the reference verifier prints as `checked-clear`. [SPEC §8.3 step 5, §8.4]

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
artifact completely, in the artifact's format-native delivery form as listed in
[§2](#2-verifier-per-format-requirements) and to the per-format rule of C-61.
[SPEC §2, §8.2]

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
python spec/verify.py spec/vectors/008-revoked-key-compromise/document.pdf \
  --root spec/vectors/root.crt \
  --revocations spec/vectors/008-revoked-key-compromise/revocations.json
```

Every vector is issued by a throwaway CA generated with the suite, so all fifteen require
`--root spec/vectors/root.crt`. Vectors 008 onward carry two further inputs in their
manifest entry: `revocations`, the list to consult, and `provenTime`, the moment a
confirmed anchor establishes. The suite covers the seal and revocation, which is
[§1](#1-verifier-the-core-algorithm), [§2](#2-verifier-per-format-requirements) and
[§5](#5-verifier-revocation) of this document, and §2, §8.3 step 5 and §8.4 of the
specification. [Open point 15](#open-points) records the fixtures the anchor and log
sections await, and what the revocation fixtures had to assume in place of an anchor.

**C-58.** An implementation claiming conformance MUST reproduce the `require` block
recorded in `spec/vectors/manifest.json` for every vector covering a format it claims,
pinning the suite's `root.crt`, and MUST report which vectors it ran. A field absent from a
vector's `require` block is unconstrained, and an implementation reports it as it sees fit.
An implementation claiming C-38 to C-43 or C-68 MUST run vectors 008 to 015 and MUST read
the `revocations` and `provenTime` inputs their entries carry. [CONFORMANCE §7]

**C-59.** The verdict vocabulary a verifier reports MUST distinguish the four cases of
C-62, in their precedence: **unsealed**, an artifact carrying no signature at all;
**altered**, which covers the bytes differing from those sealed (C-3a), the signature
failing to verify over the bytes in hand (C-3), and coverage falling short of the artifact
(C-5, C-16); **unrecognised**, a signature valid over the bytes in hand whose certificate
the verifier declines, either because it chains outside the pinned root (C-7) or because a
revocation reaches this seal (C-40 to C-43); and **authentic** (C-6, all four facts).
Vectors 002 and 006 exercise a document whose bytes moved after sealing, and 004 exercises
coverage short of the entire file. Anchor state MUST be reported separately, drawn from the
four states of C-64, and revocation state separately with it (C-68), so that `authentic,
anchor pending` and `authentic, revocation unchecked` are both sayable. [SPEC §2, §3.1, §8]

**C-60.** The negative vectors are the load-bearing ones: an implementation MUST fail a
seal whose certificate chains outside the pinned root (vector 003), MUST fail an artifact
whose bytes differ from those sealed (vectors 002 and 006), MUST fail a PDF whose
signature covers less than the entire file (vector 004), and MUST fail a seal a revocation
reaches (vectors 008, 010, 011, 012 and 013), every one of which carries a signature that
is intact, valid, chained to the pinned root and covering the whole file. An implementation
MUST also decline to report a pending or unverified anchor as proof of time; that clause is
stated ahead of its fixture, for the reason in [Open point 15](#open-points). An
implementation that passes only the positive vectors has demonstrated nothing about C-7,
C-8 or C-40. [SPEC §8]

---

## Open points

Places where the specification admits more than one reading. These are recorded rather
than resolved, so an implementer knows where two conformant-looking implementations may
diverge, and so the ambiguity can be closed in a later version.

An entry a later version of SPEC.md settles is struck through and marked **Closed**, with
the section that settled it named. Closed entries keep their number, so a review citing
"Open point 6" still lands on the same question and reads how it was answered.

1. ~~SPEC §8 step 2 names PAdES alone.~~ **Closed.** SPEC.md §8.3 step 2 now validates
   "the format-native signature defined in §2" for the artifact's type, so the algorithm is
   one algorithm over all five delivery forms (C-2, C-3), and §8.2 states coverage per
   format rather than in terms of PDF.
2. ~~"Coverage is the entire file" for enveloped forms.~~ **Closed.** SPEC.md §8.2 defines
   `entire_file` per format: the entire file for PDF, following from `intact` for a detached
   signature, the document with the signature element excluded for XML-DSig, the hard
   binding with the manifest store excluded for C2PA, and the signed part in full for
   S/MIME. C-61 carries the table.
3. ~~A proof with no `.ots`.~~ **Closed.** SPEC.md §3.1 names `absent` for an artifact
   supplied with no anchor proof, and §8.4 reports anchor state beside the verdict rather
   than folded into it, so a seal that is intact, valid, trusted and entire-file with no
   anchor is `authentic, anchor absent` (C-25, C-62, C-64).
4. ~~§8 step 3 names Bitcoin.~~ **Closed.** SPEC.md §8.3 step 4 now verifies the `.ots`
   against the ledger of §3 and reports the state from the §3.1 vocabulary, naming no
   particular chain, which is the reading C-29 already took.
5. ~~Revocation is absent from SPEC.md.~~ **Closed.** SPEC.md §8.3 step 5 makes consulting
   the published revocation list a step of the algorithm, fixes the reason semantics, and
   requires an `unchecked` report where the list is out of reach (C-38 to C-43, C-68). The
   concrete reason codes stay with the issuing CA's policy, CPS §4.9 for the Let's Seal CA.
6. ~~The moment at which certificate validity is judged.~~ **Closed.** SPEC.md §8.3 step 3
   judges validity at the anchored time where a confirmed anchor is present and at
   verification time otherwise, with a SHOULD to say which (C-63).
7. ~~"canonical-JSON" in the §6 leaf is undefined.~~ **Closed.** SPEC.md's Conventions
   define canonical JSON as the members in the order the shape gives, with no insignificant
   whitespace, encoded as UTF-8, integers with no fraction part or exponent, and RFC 8259
   string escapes; §6 fixes the leaf's member order as `{v, sha256, sealType, certCN, ts}`
   and states that sorting, RFC 8785 JCS among them, computes a different leaf hash (C-32).
8. ~~The STH signature encoding is unspecified.~~ **Closed.** SPEC.md §6 fixes the
   signature as ECDSA on P-256 over SHA-256 of the canonical bytes, DER-encoded and carried
   as base64, served with the log certificate and chain as PEM so an STH is self-contained,
   and names the JSON members an STH carries (C-65, C-66).
9. ~~Inclusion proof inputs.~~ **Closed.** SPEC.md §6 names the served shape
   `{index, treeSize, leafHash, rootHash, proof[]}`, with `index` and `treeSize` REQUIRED
   because RFC 6962 audit-path arithmetic is performed with them (C-67).
10. ~~The `anchor` state vocabulary.~~ **Closed.** SPEC.md §3.1 fixes it at `confirmed`,
    `pending`, `absent` and `unverified` (C-64). The log's own heads draw from the same four
    (C-35), and the strings a verifier used to emit for a check it could not run, `unknown`,
    `error` and `no-ots-client` among them, are `unverified`, which §3.1 keeps distinct from
    `pending` on purpose. The §4 JSON's `anchor` member carries a state from that vocabulary
    plus the block.
11. ~~No verdict term for "no seal present."~~ **Closed.** SPEC.md §8.4 now fixes the
    vocabulary at `unsealed`, `altered`, `unrecognised` and `authentic`, with a precedence
    order, and the reference verifier reports `UNSEALED`.
12. **§8.2's coverage table against the §5 supply-chain forms.** §8.2 settles the detached
    case, where completeness follows from `intact` because the signature is over the digest,
    and the same reasoning reads over a cosign blob signature, which §5 calls digest-only.
    The table names the five delivery forms of §2 rather than the supply-chain forms, so
    that reconciliation is left implicit.
13. **Behaviours SPEC.md states descriptively, which this document reads as normative.**
    §4's lowercase-hex permalink (C-1); §2's "verifies with stock tooling and no Let's Seal
    server" (C-14, C-21, C-22, C-24); §2's "a conforming verifier configures / pins the
    published SEAL root" (C-19, C-21); §2's note on what a desktop mail client shows
    (C-23); §3's sentence that a proof includes an `.ots` (C-25); §6's sentence that the
    STH is OpenTimestamps-anchored (C-35); and CPS §7.2 on the entry shape of the
    revocation list (C-39), the requirement to consult that list now resting on SPEC §8.3
    step 5. C-58 rests on no SPEC.md sentence at all and takes its authority from
    [§7](#7-self-test) of this document. Promoting these sentences to MUSTs in SPEC.md
    would settle each one; until then each is a reading, recorded here.
14. **The intermediate CAs are absent from SPEC.md.** §2 pins the root only, while CPS
    §1.3.1 describes an Intermediate CA and an Identity CA, and the reference verifier ships
    the intermediate as an untrusted helper certificate. Whether a verifier must supply the
    intermediate itself, or expects it in the signature, is unstated.
15. **The vectors cover the seal and revocation.** `spec/vectors/` ships fifteen fixtures
    over SPEC §2, §8.3 step 5 and §8.4, which is [§1](#1-verifier-the-core-algorithm),
    [§2](#2-verifier-per-format-requirements) and [§5](#5-verifier-revocation) of this
    document. Vectors 008 to 015 carry C-38 to C-43 and C-68: C-40 by 008, C-41 and C-42 by
    009 against 010 and 011, C-43 by 012, C-39's match over the whole chain by 013, and
    C-68's two states by 014 and 015. The four verdicts of §8.4 are each exercised:
    `authentic` by 001, 005, 009, 014 and 015, `altered` by 002, 004 and 006,
    `unrecognised` by 003 and by every vector a revocation reaches, and `unsealed` by 007.

    Anchor vectors are absent because a confirmed ledger attestation cannot be manufactured
    offline, and a fabricated one would undermine the only thing a conformance suite is for,
    so C-25 to C-31 and C-64 have fixtures still to come, and C-60's pending-anchor clause
    with them. C-32 to C-37 and C-65 to C-67, the transparency log, are unfixtured for a
    different reason: the arithmetic there is RFC 6962 unchanged, so a vector is a leaf
    preimage and an audit path rather than a sealed artifact.

    The revocation vectors reach around the missing anchor by supplying the proven moment
    as a manifest input rather than as a proof. C-42 requires that moment come from a
    confirmed anchor, and a fixture that hands it over instead is testing the rule while
    standing outside the evidence the rule rests on. `spec/vectors/README.md` and the
    manifest both say so at the point of use, and vector 011 fixes the case the concession
    could otherwise hide: with no proven moment at all, the seal is refused.
16. ~~SPEC §8 counts the conjuncts two ways.~~ **Closed.** SPEC.md §8.1 lists the four
    facts and §8.4 states the rule once: an artifact is SEAL-authentic if and only if
    `intact` and `valid` and `trusted` and `entire_file` all hold. Four conjuncts, and only
    four, which C-6 carries. That is the reading which catches vector 002, a PDF with one
    byte of page content changed: the manifest requires `intact: false` there and constrains
    the other fields freely, since an implementation may reasonably report the certificate
    chain as sound while the bytes have moved. `spec/verify.py` and
    `spec/vectors/manifest.json` compute authenticity the same way.
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
20. ~~The verdict a revoked certificate earns.~~ **Closed.** SPEC.md §8.4 names the
    mapping: row 3 reports `unrecognised` both for a certificate chaining elsewhere than the
    pinned root and for one a revocation reaches, so the withdrawal of trust in §8.3 step 5
    has a verdict to land in. C-62, C-59, §5's opening, the Internet-Draft's verdict table
    and IMPLEMENTATIONS.md carry the same row, and `spec/verify.py` reports `UNRECOGNISED`
    with the revocation reason named.
