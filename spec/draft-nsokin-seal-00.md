---
title: "SEAL: Sealed Evidence, Anchored to a Ledger"
abbrev: SEAL
docname: draft-nsokin-seal-00
category: info
submissiontype: independent
ipr: trust200902
area: Security
keyword:
 - digital signature
 - document authenticity
 - transparency log
 - timestamping
 - provenance
 - PAdES
 - CAdES
 - public key infrastructure
stand_alone: yes
v: 3
pi: [toc, sortrefs, symrefs, compact, subcompact]

author:
 -
    ins: N. Sokin
    name: N. Sokin
    organization: Let's Seal
    email: tech@letsseal.org
    uri: https://letsseal.org/

normative:
  RFC3161:
  RFC4648:
  RFC5280:
  RFC5480:
  RFC5652:
  RFC5758:
  RFC6962:
  RFC8259:
  RFC8551:
  RFC8552:
  ETSI-319-142-1:
    target: https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.01.01_60/en_31914201v010101p.pdf
    title: "Electronic Signatures and Infrastructures (ESI); PAdES digital signatures; Part 1: Building blocks and PAdES baseline signatures"
    author:
      - org: European Telecommunications Standards Institute
    date: 2016-03
    seriesinfo:
      ETSI: EN 319 142-1 V1.1.1
  ETSI-319-122-1:
    target: https://www.etsi.org/deliver/etsi_en/319100_319199/31912201/01.01.01_60/en_31912201v010101p.pdf
    title: "Electronic Signatures and Infrastructures (ESI); CAdES digital signatures; Part 1: Building blocks and CAdES baseline signatures"
    author:
      - org: European Telecommunications Standards Institute
    date: 2016-04
    seriesinfo:
      ETSI: EN 319 122-1 V1.1.1
  XMLDSIG:
    target: https://www.w3.org/TR/xmldsig-core1/
    title: "XML Signature Syntax and Processing Version 1.1"
    author:
      - org: World Wide Web Consortium
    date: 2013-04-11
    seriesinfo:
      W3C: Recommendation REC-xmldsig-core1-20130411
  OPENTIMESTAMPS:
    target: https://opentimestamps.org/
    title: "OpenTimestamps: a timestamping proof standard"
    author:
      - name: Peter Todd
    date: 2016
  C2PA:
    target: https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html
    title: "Coalition for Content Provenance and Authenticity (C2PA) Technical Specification, Version 2.1"
    author:
      - org: Coalition for Content Provenance and Authenticity
    date: 2024

informative:
  RFC3647:
  RFC8555:
  RFC8785:
  RFC9162:
  COSIGN:
    target: https://github.com/sigstore/cosign
    title: "Sigstore cosign: container signing, verification and storage in an OCI registry"
    author:
      - org: The Sigstore Authors
    date: 2024
  SLSA:
    target: https://slsa.dev/spec/v1.0/
    title: "Supply-chain Levels for Software Artifacts (SLSA), Version 1.0"
    author:
      - org: Open Source Security Foundation
    date: 2023
  IN-TOTO:
    target: https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
    title: "in-toto Attestation Framework: Statement layer, version 1"
    author:
      - org: The in-toto Authors
    date: 2023
  DSSE:
    target: https://github.com/secure-systems-lab/dsse
    title: "Dead Simple Signing Envelope"
    author:
      - org: Secure Systems Lab
    date: 2021
  SEAL-SPEC:
    target: https://github.com/letsseal/letsseal/blob/main/SPEC.md
    title: "SEAL: Sealed Evidence, Anchored to a Ledger (project specification, version 1.1)"
    author:
      - org: Let's Seal
    date: 2026
  SEAL-CPS:
    target: https://github.com/letsseal/letsseal/blob/main/CPS.md
    title: "Let's Seal Certificate Policy and Certification Practice Statement, Version 1.0"
    author:
      - org: Let's Seal
    date: 2026
  SEAL-IMPL:
    target: https://github.com/letsseal/letsseal
    title: "Let's Seal reference implementation"
    author:
      - org: Let's Seal
    date: 2026

--- abstract

This document specifies SEAL (Sealed Evidence, Anchored to a Ledger), a profile that
combines two independent parts and a referencing convention so that the integrity of a
file, the certificate that sealed it, and the time by which the file existed can be
established by any party using stock tools and published trust anchors. A SEAL proof
consists of a signature in the artifact's format-native form (PAdES for PDF, C2PA for
images, XML Signature for XML, S/MIME for email messages, and detached CAdES/CMS for any
other artifact) and an OpenTimestamps proof committing the artifact's SHA-256 digest to a
public append-only ledger. An implementation MAY additionally record each seal in an RFC
6962 transparency log whose signed tree head is committed to the same ledger. This
document defines the profile, the normative verification algorithm, and the security
properties that follow from it.

--- middle

# Introduction

## The problem

A relying party who receives a document and wishes to establish that it is genuine has,
in current practice, two workable routes. The first is to obtain the document again from
its issuer over an authenticated channel, which requires the issuer to still exist, to
still hold the record, and to be reachable. The second is to rely on a signature whose
certificate is recognised by a vendor trust programme, such as an operating system root
store, a document reader's trusted list, or a supervised scheme. That second route works
well, and it places the decision about which issuers are acceptable inside the programme
rather than with the relying party: verification succeeds when the verifier's software is
enrolled in the programme, and it produces an indeterminate answer otherwise. Entry to
such programmes carries a cost per issuer, which sets a floor on who seals documents at
all.

SEAL specifies a third route. Trust is pinned by the relying party to a root certificate
published at a stable location and identified by its SHA-256 fingerprint. Every check a
relying party performs is defined by a public standard and runs in software the issuing
party had no hand in: a PAdES or CMS validator for the seal, an OpenTimestamps client for
the anchor, and RFC 6962 arithmetic for the transparency log. The result is a proof that
travels with the artifact and that a third party can evaluate on its own terms.

## What SEAL specifies

SEAL specifies:

* the form a seal takes in each artifact format ({{the-seal}});
* the properties an anchor's ledger has, and the profile issued today ({{the-anchor}});
* an RFC 6962 transparency log profile, including the exact bytes a signed tree head
  covers and the identity by which the log's key is pinned ({{the-transparency-log}});
* a canonical convention for referencing a proof ({{the-proof-convention}});
* the semantics of revocation reason codes, which decide how far back a withdrawal of
  trust reaches ({{revocation}});
* a normative verification algorithm ({{verification}}).

The core of a SEAL proof is a seal and an anchor. The transparency log, the supply-chain
profile and the identity profile are additive profiles that a conforming implementation
MAY offer, and each is verifiable with third-party tools.

## Relationship to the reference implementation

This document describes a profile that is deployed. A reference implementation
{{SEAL-IMPL}}, the project specification {{SEAL-SPEC}} it tracks, and a certificate
policy and certification practice statement {{SEAL-CPS}} written in the RFC 3647
{{RFC3647}} framework are published. Where this document and that implementation
disagree, the disagreement is a defect in one of them and reports are welcome.

Some requirements stated here reach ahead of what the reference implementation exercises
today, and naming them is more useful than leaving a reader to discover them. The
published revocation list is served unsigned. The time-bounded revocation semantics of
{{revocation}} and the certificate-validity rule of {{verification}} are specified against
a confirmed anchor's proven time, while the deployed callers evaluate revocation without
supplying that time, so every revocation currently reaches every seal, which is the safe
direction. The PDF verification path consults the revocation list for the leaf
certificate, and the path check of {{verify-revocation}} is exercised in full on the
detached path. The log serves inclusion and consistency proofs, and the leaf entry bytes
and the ledger commitment on a Signed Tree Head are held rather than served. The Log ID of
{{log-id}} is computed by the implementation and reachable to its operator, and publishing
it beside the root fingerprint remains to be done. Each of these is tracked as an
implementation defect against this document.

# Conventions and Definitions

{::boilerplate bcp14-tagged}

# Terminology

Artifact:
: The sequence of bytes whose authenticity is at stake. A PDF, an image, an XML document,
  an email message, a build output, or any other file.

Seal:
: A digital signature over an artifact, made with a certificate that chains to a pinned
  trust anchor, carried in the artifact's format-native delivery form.

Anchor:
: A proof committing the artifact's SHA-256 digest to a public append-only ledger, from
  which the time by which the artifact existed can be derived.

Pinned root:
: A trust anchor certificate that a relying party has obtained and whose SHA-256
  fingerprint it has compared against a published value. Trust in a seal follows from
  this act by the relying party.

Intact:
: A property of a seal: the digest carried in the signature matches the bytes now
  present over the range the signature covers.

Valid:
: A property of a seal: the signature verifies cryptographically under the public key in
  the signing certificate.

Trusted:
: A property of a seal: the signing certificate chains to the pinned root under
  {{RFC5280}} path validation.

Complete:
: A property of a seal: the range the signature covers is the artifact in its entirety.

Authentic:
: A property of an artifact: its seal is intact, valid, trusted and complete, all four
  together.

Signed Tree Head (STH):
: A signed statement binding a transparency log's size, Merkle root hash and timestamp,
  as profiled in {{sth}}.

Confirmed anchor:
: An anchor whose commitment has been included in the ledger and for which a ledger
  attestation can be read by a verifier.

Pending anchor:
: An anchor for which a calendar server has issued a receipt and for which a ledger
  attestation has yet to appear.

# Architecture

A SEAL proof has two independent parts and one convention.

~~~
 artifact bytes
      |
      +--> seal    signature by a certificate chaining to
      |            the pinned root, in the format-native
      |            form: integrity and which certificate
      |
      +--> anchor  SHA-256(artifact) committed to a public,
      |            append-only, ownerless ledger: the
      |            artifact existed by a ledger position
      |
      +--> log     RFC 6962 leaf recording the seal, with
      |            the log's signed tree head anchored too:
      |            issuance observable by third parties
      |
      +--> /d/<sha256>
                   one stable way to reference the proof
~~~

Each part is checkable on its own, with separate software. The core determination of
{{verification}} step 2 stands without the anchor; the refinements in
{{verify-revocation}} and the certificate-validity rule of {{verification}} use the
anchor's proven time where one is available, and fall back to the current time otherwise.
The seal establishes integrity and the sealing certificate. The anchor establishes time, and
its evidence survives the withdrawal, expiry or compromise of the sealing key, which is
what makes the revocation semantics in {{revocation}} workable.

A proof is self-contained. The seal travels inside the artifact where the format has a
slot for it, and beside the artifact as a sidecar otherwise. The anchor is a small
sidecar file. Verification of the core proof uses the artifact, the sidecars, the pinned
root and stock software.

## Cryptographic profile

All certificates defined by this profile are X.509 v3 {{RFC5280}} with ECDSA P-256 keys
{{RFC5480}} and SHA-256 signatures {{RFC5758}}. Every digest named in this document,
including artifact digests, Merkle leaf and node hashes, and certificate fingerprints, is
SHA-256. Serial numbers carry at least 128 bits of entropy with the high bit cleared, so
that the DER INTEGER encoding is unambiguously positive.

## Trust anchor {#trust-anchor}

An implementation MUST publish a root CA certificate at a stable location together with
its SHA-256 fingerprint in a form a person can compare by eye. A relying party obtains
the root, compares the fingerprint against the published value by whatever channel it
considers authoritative, and pins it. Every later decision follows from that single act.

A verifier SHOULD allow the pinned root to be supplied by its operator, since a
self-hosted deployment operates its own CA under its own root and a relying party
verifying against that deployment pins that root instead. The trust decision belongs to
the relying party in either case.

The root key is held offline and signs intermediates only. This profile uses two
intermediates: a general intermediate that issues subscriber certificates for documents,
software and data, and an identity intermediate constrained by `pathlen:0` and by
extended key usage, which issues the short-lived certificates of the identity profile
({{identity-profile}}). Holding the online issuing key in a separate, constrained
intermediate bounds the consequences of its compromise to the certificates it can mint.

Certificate profiles are as follows.

| Profile | Basic constraints | Key usage | Extended key usage |
|---|---|---|---|
| Root | critical, CA:TRUE | critical, keyCertSign, cRLSign | absent |
| Intermediate | critical, CA:TRUE, pathlen:0 | critical, keyCertSign, cRLSign | absent |
| Identity CA | critical, CA:TRUE, pathlen:0 | critical, keyCertSign, cRLSign | emailProtection, codeSigning |
| document | critical, CA:FALSE | critical, digitalSignature, nonRepudiation | emailProtection |
| code | critical, CA:FALSE | critical, digitalSignature | codeSigning |
| data | critical, CA:FALSE | critical, digitalSignature, nonRepudiation | absent |
| identity | critical, CA:FALSE | critical, digitalSignature, nonRepudiation | emailProtection, codeSigning |

## Issuer naming {#issuer-naming}

The subject distinguished name of a subscriber certificate carries a human-readable label
chosen by the subscriber. A verifier MUST treat that label as a claim by the subscriber
and MUST NOT present it as an authenticated identity.

The authenticated identity of a subscriber lives in the subjectAltName extension:

* `URI:https://<host>/o/<slug>` identifies the subscriber's namespace at the issuing
  host, and is present on every organisation certificate.
* `dNSName:<domain>` asserts that the subscriber demonstrated control of that domain at
  issuance. Because a domain name is globally unique, it disambiguates entities that
  chose the same label.

A certificate carrying the URI form alone denotes a self-asserted issuer name. The seal's
integrity and time claims hold in full; the displayed name is the subscriber's own claim,
and a verifier presents it as such.

## Domain validation {#domain-validation}

An issuer that binds a `dNSName` SAN MUST first establish control of that domain by one
of the following two methods, and MUST perform the check itself rather than accept an
assertion from the applicant. The design follows the pattern established by ACME
{{RFC8555}}.

DNS method:
: The applicant publishes a TXT record at the node name `_letsseal-challenge.<domain>`
  whose RDATA is the string `letsseal-verify=` followed by a token issued for that
  challenge. The token MUST be generated by the issuer with at least 128 bits of entropy
  and MUST be bound to one applicant and one domain. The challenge has a lifetime, which
  is 7 days in this profile.

Controller email method:
: The issuer sends a confirmation to one of the local parts `admin`, `administrator`,
  `postmaster`, `hostmaster` or `webmaster` at the domain, and treats a completed
  confirmation as evidence of control. The challenge lifetime is 24 hours in this
  profile.

Issuing a fresh challenge for an applicant and domain retires any earlier pending
challenge for that pair, so that exactly one token is live at a time.

# The Seal {#the-seal}

## General requirements

A conforming artifact MUST carry a signature over its bytes made with a certificate that
chains to the pinned root, in the delivery form its format defines. The signer's
certificate and the intermediates needed to build the path to the root MUST be carried
with the signature, so that a verifier holding the root alone can complete path
validation.

The seal establishes two facts: that the artifact is byte-for-byte what was sealed, and
which certificate produced the signature. {{security-considerations}} states what follows
from those two facts about the identity of the party behind the certificate.

## PDF: PAdES

A sealed PDF MUST carry a PAdES signature {{ETSI-319-142-1}} embedded in the file, with
the `SubFilter` value `ETSI.CAdES.detached`, whose byte range covers the entire file.

A signature that covers a prefix of the file, which is the state a PDF reaches when
content is appended by an incremental update after signing, is non-conformant for this
profile and MUST be reported as altered. This rule is the reason completeness is a
separate input to the verification algorithm in {{verification}} rather than a consequence
of signature validity.

The signature SHOULD carry an RFC 3161 signature timestamp {{RFC3161}}, which raises it
to PAdES level B-T. Public timestamp authorities operated for code signing are sufficient
for that level. A verifier MUST NOT require the presence of such a timestamp: it is a
second, convenient witness to time, and the authoritative witness is the anchor
({{the-anchor}}), whose evidence remains readable for as long as the ledger does. An
implementation SHOULD treat a timestamp authority outage as a reason to seal at level B-B
rather than as a reason to fail the seal.

Levels above B-T, namely B-LT and B-LTA, embed chain revocation data drawn from CRL or
OCSP responders. This profile publishes revocation as a list at a stable location
({{revocation}}), so those levels are outside its scope.

## Images and time-based media: C2PA

A sealed image, video or audio file MUST carry a C2PA manifest {{C2PA}} embedded in the
file, signed by a certificate meeting the C2PA end-entity certificate profile. The
`document` profile in {{trust-anchor}} satisfies that profile, since it is an EC P-256
key with key usage `digitalSignature` and extended key usage `emailProtection`, which is
in the C2PA default set.

A conforming verifier configures the pinned root as a C2PA trust anchor. A manifest that
validates and chains to that anchor is trusted. A manifest that validates under some
other certificate is valid and untrusted, and {{verification}} decides the outcome.

A conforming implementation MAY omit an RFC 3161 timestamp from the manifest, in which
case time comes from the anchor alone, and the signing path runs entirely on the issuer's
own key material.

## XML: XML Signature

A sealed XML document MUST carry an enveloped XML Signature {{XMLDSIG}} embedded in the
document. The signature covers the document with the signature element itself excluded,
using the enveloped-signature transform followed by canonicalisation. The signing
certificate and the intermediates are carried in `KeyInfo/X509Data`. The signature method
is ECDSA with SHA-256.

## Email messages: S/MIME

A sealed email message MUST be delivered as a `multipart/signed` entity carrying a
detached CMS signature as defined by S/MIME {{RFC8551}}, with the signer's chain
embedded. The content is signed with text canonicalisation, which is what mail transfer
and stock verifiers assume, so that the body remains readable in the first MIME part.

A mail client presents such a message as signed and untrusted until the pinned root is
present in its trust store, which is the same pinned-root model that applies to every
other seal form in this profile. The cryptographic conclusion is available at once from a
stock command line verifier holding the published root.

## Any other artifact: detached CAdES/CMS

An artifact in any other format MUST be sealed by a detached CMS SignedData
{{RFC5652}} at CAdES baseline level B-B {{ETSI-319-122-1}}, carrying the ESS
signing-certificate-v2 signed attribute, delivered as a sidecar named by appending `.sig`
to the artifact's filename. The `messageDigest` signed attribute carries the SHA-256
digest of the artifact, and the signer's certificate chain is embedded in the
`certificates` field of the SignedData, so that the sidecar is self-contained.

A detached signature over the artifact's digest covers the artifact in its entirety by
construction, so completeness follows from validity for this form.

The digest of the artifact is the only input the signer requires. An implementation MAY
therefore compute the digest on the holder's own machine and transmit only that digest,
in which case the artifact itself stays with its holder throughout sealing.

A verifier MUST hash the artifact's raw bytes when checking the signature. Where a
verifier is built on a general S/MIME implementation, it MUST disable text
canonicalisation of the content, since converting line endings before hashing would
produce a digest other than the one signed.

## Software artifacts: supply-chain profile

An implementation MAY offer a supply-chain profile, whose artifacts are verifiable with
stock sigstore tooling {{COSIGN}} under the pinned root and a certificate of the `code`
profile:

Blob signature:
: A raw ECDSA P-256 signature over the artifact's SHA-256 digest, accompanied by the
  signer's leaf certificate and chain, in the flat signature-and-certificate form.

Container image:
: A simple signing payload, signed and pushed as an OCI image tagged
  `sha256-<digest>.sig` alongside the image it describes.

Attestation:
: An in-toto Statement {{IN-TOTO}} whose subject is the artifact's SHA-256 digest,
  carried in a DSSE envelope {{DSSE}}, over an SPDX, CycloneDX or SLSA {{SLSA}}
  provenance predicate.

Stock cosign verifies these artifacts against the pinned root when supplied with the log's
key material in its trust bundle format. Where that bundle is absent, the documented
invocations disable cosign's built-in log and identity checks, and the guarantees then
come from {{the-transparency-log}} and from the certificate profile of {{trust-anchor}}
rather than from cosign's defaults. An implementation offering this profile SHOULD
therefore publish the log's key material in the trust bundle format the verifying tool
consumes, so that the log check runs against this log.

Because this profile is optional, the formats it names are cited as informative
references.

# The Anchor {#the-anchor}

The anchor is what makes the time claim checkable by a party that trusts nobody named in
the proof. The requirement is therefore stated as a property of the ledger rather than as
the name of one.

A SEAL proof MUST include an OpenTimestamps {{OPENTIMESTAMPS}} proof, carried as a
sidecar named by appending `.ots` to the artifact's filename, committing to the SHA-256
digest of the sealed artifact.

The commitment MUST land in a ledger with all of the following properties:

* public: its contents are readable by anyone running ordinary software;
* append-only: its history extends by addition, and each state commits to its
  predecessor;
* written by open participation, so that the right to extend it is available to all
  comers rather than granted;
* settled beyond the reach of any single party able to rewrite, revoke or withhold it.

A ledger governed by a foundation, a consortium or a permissioned validator set restores
the single point of decision that this layer exists to remove, and a verifier evaluating
such an attestation SHOULD treat the time claim as resting on that governing party.

An anchor is confirmed when a verifier reads an attestation from such a ledger for the
artifact's digest, and a confirmed anchor establishes that the artifact existed by the
time of the ledger position named in the attestation. A calendar server's receipt is a
promise to commit, so an anchor holding only such a receipt is pending, and a verifier
MUST report it as pending rather than as evidence of time.

The profile issued today commits to the Bitcoin block chain, which holds the properties
above and the longest continuous public record of holding them. The OpenTimestamps proof
format carries attestations from other ledgers, so a conforming implementation MAY anchor
elsewhere, and a verifier reads the attestation it finds rather than assuming which
ledger produced it.

An implementation SHOULD retain the pending proof and upgrade it once the attestation
appears, since the upgraded proof is what a third party needs in order to reach the
confirmed conclusion offline.

# The Transparency Log {#the-transparency-log}

An implementation MAY record every seal in a public append-only Merkle transparency log,
so that issuance is observable and mis-issuance is detectable by any third party rather
than by the issuer alone.

## Tree {#tree}

The log is an RFC 6962 {{RFC6962}} Merkle tree over SHA-256:

~~~
   leaf hash = SHA-256(0x00 || entry)
   node hash = SHA-256(0x01 || left || right)
~~~

The Merkle Tree Hash of an empty log is SHA-256 of the empty string, as in {{RFC6962}}
Section 2.1. Tree positions are assigned in append order.

This profile uses the version 1 tree structure of {{RFC6962}}. The tree arithmetic of
{{RFC9162}} uses the same 0x00 and 0x01 prefixes over the same node construction; it
differs in permitting a negotiated hash function and in the leaf payload it defines for
Certificate Transparency. This profile fixes SHA-256 and defines its own leaf entry bytes
in {{leaf-entries}}.

## Leaf entries {#leaf-entries}

The entry that a leaf hash covers is the exact byte string described here, in the key
order given, with no insignificant whitespace, encoded as UTF-8 JSON {{RFC8259}}:

~~~
{"v":1,"sha256":"<hex>","sealType":"<type>","certCN":"<cn>","ts":<ms>}
~~~

where `sha256` is the lowercase hexadecimal SHA-256 digest of the sealed artifact,
`sealType` names the delivery form of the seal, `certCN` is the common name of the
signing certificate, and `ts` is the time of the append in milliseconds since the UNIX
epoch. The `v` member carries the value 1 for the shape defined here, and an
implementation changing the shape MUST increment it so that a leaf preimage remains
unambiguous.

The key order above is fixed by this document and is the order in which the members are
listed. Implementers should note that it differs from the lexicographic member ordering
that JSON Canonicalization Scheme {{RFC8785}} produces, so a leaf preimage is generated
by emitting the members in the order given here.

An implementation offering the supply-chain profile MAY append leaves whose entry is the
exact canonical body of a supply-chain log entry instead, so that a third-party tool
recomputing the leaf hash from that body arrives at the same value. A verifier
recomputing a leaf hash therefore uses the entry bytes served for that leaf rather than
assuming a single shape.

An implementation MUST make the entry bytes of a leaf retrievable, since a relying party
reproduces a leaf hash from those bytes.

## Signed Tree Head {#sth}

The head of the log is a Signed Tree Head carrying the tree size, the Merkle root hash
and a timestamp. The signature is ECDSA with SHA-256, in DER encoding, base64 encoded
{{RFC4648}} for transport, made with a dedicated log key whose certificate chains to the
same pinned root as every other seal, so that a verifier needs no new trust anchor to
check an STH.

The signature covers exactly the following ASCII byte string, with LF line endings and a
trailing LF:

~~~
letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n
~~~

Each `\n` above denotes a single LF octet (0x0A). There is no other whitespace.

`<treeSize>` is the tree size in decimal with no leading zeros, `<rootHex>` is the Merkle
root hash as 64 lowercase hexadecimal characters, and `<tsMs>` is the timestamp in
milliseconds since the UNIX epoch, as a non-negative integer in decimal with no leading
zeros. A signer MUST reject a root hash outside that form, and MUST reject a negative tree
size or a timestamp outside that form, so that the signing bytes cannot be made ambiguous
by a malformed input.

An implementation MUST publish the log certificate and its chain alongside the STH, so
that an STH is self-contained.

## Log identity {#log-id}

Path validation alone establishes that some key under the pinned root signed a Signed Tree
Head. It leaves any holder of a subscriber certificate under that root able to produce
bytes that satisfy the requirements of {{sth}}, which would void the conclusions of
{{log-misbehaviour}}. The log is therefore identified by its key.

The Log ID is the SHA-256 digest of the DER encoding of the log public key's
SubjectPublicKeyInfo, as {{RFC6962}} Section 3.2 defines it. An implementation offering
the log MUST publish the Log ID alongside the root fingerprint of {{trust-anchor}}, in the
same form a person can compare by eye, and a relying party pins it by the same act that
pins the root.

A verifier MUST reject a Signed Tree Head whose signing key has a Log ID other than the
pinned one, and MUST perform that check in addition to path validation rather than in
place of it.

## Proofs

An implementation offering the log MUST serve:

* inclusion proofs, which establish that a given leaf is in the tree of a given size, per
  {{RFC6962}} Section 2.1.1;
* consistency proofs, which establish that the tree of size M is a prefix of the tree of
  size N, per {{RFC6962}} Section 2.1.2.

An inclusion proof MUST name the tree size it was computed against, and the index, root
hash and audit path returned MUST all describe that same tree. A relying party SHOULD
request a proof against the tree size of a Signed Tree Head it already holds, so that it
can check the proof against that head. A request naming a tree size larger than the
current tree MUST be refused rather than served against a smaller tree.

A relying party checks both proofs with the arithmetic in {{RFC6962}} using the leaf
hash, the audit path and a signed root, and reaches its conclusion with no trust in the
serving host.

## Anchoring the head {#anchoring-the-head}

An implementation offering the log MUST periodically commit a Signed Tree Head to the
ledger described in {{the-anchor}}, by anchoring the root hash of the head, and MUST
publish enough anchored heads for an observer to audit its history. This pins the log's
history to a clock outside the log operator's control, and it is the property that
{{log-misbehaviour}} relies on. An implementation SHOULD serve the ledger commitment for a
head alongside the head itself, since a relying party applying the rule of
{{log-misbehaviour}} needs the commitment in hand.

# The Proof Convention {#the-proof-convention}

Every proof has a canonical permalink of the form `/d/<sha256>`, where `<sha256>` is the
lowercase hexadecimal SHA-256 digest of the sealed artifact, and a machine-readable twin
at `/api/v1/documents/<sha256>` returning a JSON object {{RFC8259}} carrying at least the
members `sha256`, `sealed`, `issuer`, `anchor`, and `proof`, where `anchor` is an object
carrying at least the anchor's state and, where the anchor is confirmed, its ledger
position.

A conforming host MAY expose these paths under its own domain. The shape of the
convention is what conforms, and addressing a proof by digest is what allows the
convention to be satisfied by a host that holds the digest alone.

# Revocation {#revocation}

An implementation MUST publish the list of certificates whose trust has been withdrawn, at
a stable location, and SHOULD sign it so that a cached copy carries integrity independent
of the transport that delivered it. A relying party may then fetch the list once, cache
it, and continue to rely on it while working offline.

The list is a JSON object {{RFC8259}}, served as `application/json`, carrying the members
`version` (the value 1 for the shape defined here), `updated_at` (the time the list was
last written, as a UTC timestamp) and `revoked` (an array of entries). Each entry carries
`serial`, the certificate serial in lowercase hexadecimal; `subject`, the subject
distinguished name; `reason`, one of the codes below; `revoked_at`, the time of revocation
as a UTC timestamp; and `note`, an optional free-text string.

Where the list is signed, the signature covers the exact bytes served, byte for byte and
with no canonicalisation applied, and is made with the log key of {{sth}} using ECDSA with
SHA-256 in DER encoding, base64 encoded {{RFC4648}}. The signature and the signing
certificate's chain are published beside the list, so that a cached copy is
self-contained, and a verifier checks the signing key against the pinned Log ID of
{{log-id}} in the same way it checks a Signed Tree Head.

The reason code decides how far back the withdrawal of trust reaches. This is the part of
revocation that decides whether honest evidence survives, and a verifier MUST apply it as
follows.

| Reason | Effect on seals made before the revocation time |
|---|---|
| `key_compromise`, `ca_compromise` | Untrusted, whatever their date |
| `superseded`, `cessation_of_operation`, `affiliation_changed`, `privilege_withdrawn` | Trusted, where the seal is provably earlier than the revocation time |
| any value outside this table, including one a verifier lacks a rule for | Handled as `key_compromise` |

These names are the CRLReason values of {{RFC5280}} Section 5.3.1 in
lower-case-with-underscores form. The value `unspecified` falls under the final row and is
handled as `key_compromise`.

A key held by another party was in that party's hands from a moment nobody can establish,
so a compromise reason reaches every seal made under the certificate. An orderly
retirement carries no such uncertainty, so seals demonstrably made before the retirement
stand.

The phrase "provably earlier" means evidence a relying party can check without consulting
the issuer, and a confirmed anchor ({{the-anchor}}) is such evidence: it places the
artifact before a named ledger position. Absent such evidence, a verifier MUST treat a
revocation of any reason as reaching the seal.

A verifier MUST apply this check to every certificate in the path, since revoking an
intermediate has to reach the leaves it minted, each of which is individually unlisted.

A verifier that fails to parse the published list MUST retain the last list it parsed
successfully rather than proceeding as though nothing were revoked.

# The Identity Profile {#identity-profile}

An implementation MAY offer a profile that binds an email address which a third-party
identity provider verified at the moment of sealing.

The signer proves control of an email address through an identity provider. The
provider's token is verified with the issuer and audience pinned, the signature checked
against the provider's published key set, the verified-email claim required, and
unsecured or symmetric algorithm substitution rejected. On success a short-lived
certificate, valid for approximately 15 minutes, is minted under the identity
intermediate binding the provider-verified address as a subjectAltName, with the identity
provider recorded in a certificate extension, and that certificate signs the artifact's
digest.

The extension recording the identity provider is the sigstore issuer extension, OID
`1.3.6.1.4.1.57264.1.8`, carried non-critical, whose extension value is the provider's
issuer URI encoded as UTF-8. That OID sits in sigstore's Private Enterprise Number arc,
and this profile uses it so that a certificate from the identity profile is legible to
cosign and the rest of the sigstore tool chain. An implementation reusing this profile
under another name uses the same OID, so that the extension keeps one meaning across
implementations.

The claim this profile carries is precise: a named provider verified control of a named
address at a named moment. A conforming presentation states it in those terms.

# Verification Algorithm {#verification}

This section is normative. It states the core determination, which uses the artifact, its
seal, the pinned root and, for time, the anchor. The additional checks in
{{verify-revocation}} and {{verify-log}} apply where an implementation offers those
components.

## Inputs

A verifier requires the artifact bytes and the pinned root certificate. It further
requires the seal, which is embedded in the artifact for the PDF, image and XML forms and
supplied as a sidecar for the detached form, and, for time, the `.ots` anchor.

## Procedure

1. Compute the SHA-256 digest of the artifact.

2. Validate the seal, establishing four properties separately:

   * intact: the digest carried in the signature matches the bytes now present over the
     range the signature covers;
   * valid: the signature verifies cryptographically under the public key in the signing
     certificate;
   * trusted: the signing certificate chains to the pinned root under {{RFC5280}} path
     validation;
   * complete: the range the signature covers is the artifact in its entirety.

   All four together establish integrity and the sealing certificate.

   A verifier MUST determine and report these separately, and MUST NOT collapse them.
   Intactness and validity in particular answer different questions: a signature object
   can verify while the content it covers has moved underneath it, and a verifier reading
   validity alone would report tampering as an issuer problem. Completeness is separate in
   the same way: where an implementation reports a single intactness flag that already
   incorporates completeness, it states that relationship explicitly, so that a reader can
   tell which of the two failed.

3. Verify the anchor against the ledger. An attestation for the artifact's digest
   establishes that the artifact existed by the time of the ledger position named in the
   attestation. An anchor carrying only a calendar receipt is reported as pending.

4. The artifact is SEAL-authentic if and only if step 2 holds in all four properties. A
   valid signature made under a certificate that chains to some other trust anchor
   establishes only that some key signed those bytes; a verifier MUST report that outcome
   as unrecognised, and MUST NOT report it as authentic. The anchor contributes
   independent evidence of time.

The rule of step 4 is the whole of the determination: authentic means intact and valid and
trusted and complete, all four together. A verifier MUST NOT render a passing verdict from
the presence of a signature, or from integrity alone, or from any subset of the
properties. An untrusted seal fails.

## Certificate validity time

A verifier SHOULD evaluate certificate validity periods at the time established by a
confirmed anchor, where one is available, and at the current time otherwise. Binding
validity to proven time is what allows a seal made under a certificate that has since
expired to remain verifiable, and it withholds that benefit from a seal with no
independent evidence of when it was made.

## Revocation {#verify-revocation}

Where a revocation list is published, a verifier MUST consult it for every certificate in
the path and apply the reason semantics of {{revocation}}, using a confirmed anchor as
the evidence of when the artifact existed. A certificate whose revocation reaches the
seal makes the seal untrusted, and step 4 then reports it as unrecognised.

## Transparency log {#verify-log}

Where a transparency log is published, a relying party MAY additionally:

* fetch the entry bytes and the inclusion proof for the artifact's digest, recompute the
  leaf hash per {{leaf-entries}}, and check the proof against a Signed Tree Head of the
  same tree size whose signature it has verified against the pinned root and whose signing
  key it has checked against the pinned Log ID of {{log-id}};
* fetch a consistency proof between an STH it holds from an earlier observation and the
  current STH, and check that the log only appended;
* check the ledger commitment on the STH's root hash, establishing that the log's state at
  that size was fixed by a given ledger position.

A relying party performing any of these checks MUST verify the STH signature and the Log
ID before relying on the head, since an inclusion proof is a statement about a root hash
and carries no weight on its own. A relying party SHOULD reject a Signed Tree Head with no
ledger commitment where the log's policy claims one.

These checks establish that the seal is on public record and that the record has only
ever grown by addition. They contribute to the determination of {{verification}} where an
implementation's policy requires log presence.

## Reporting

A verifier reports one of the following outcomes for the seal, and reports the anchor
state alongside it:

Authentic:
: intact, valid, trusted and complete.

Unrecognised:
: valid, and outside the pinned trust anchor. A verifier MUST distinguish this outcome
  from authentic in every presentation it produces, including machine-readable ones.

Altered:
: the bytes covered by the signature have changed since sealing, or the signature covers
  a part of the artifact only.

Unsealed:
: no seal was found.

# Security Considerations {#security-considerations}

## Obtaining and pinning the trust anchor {#anchor-pinning}

Every conclusion in this profile rests on the relying party holding the correct root
certificate. An attacker who supplies a substitute root, whether by intercepting the
download or by persuading a person to install one, obtains the ability to present forged
seals as authentic, and no later check in this profile detects that.

A relying party therefore MUST verify the root's SHA-256 fingerprint against the
published value, and SHOULD do so over a channel independent of the one that delivered
the certificate. Publishing the fingerprint in a form a person can compare by eye, at a
location under transport security, in a public source repository with full history, and
in this profile's certificate policy statement, gives a relying party several independent
channels for that comparison. An implementation SHOULD ship the pinned root, or its
fingerprint, inside the verifying software rather than fetching it at verification time.

The root key is held offline. That is what makes recovery from the compromise of an
online issuing key possible: a fresh intermediate is issued under the same published
root, and relying parties who pinned that root are unaffected.

## A valid signature that chains elsewhere {#untrusted-chains}

Any party can generate a key, issue itself a certificate, and produce a signature that
verifies. Cryptographic validity is therefore available to an attacker at zero cost, and
it is the chain to the pinned root that carries the meaning.

This is the reason step 4 of {{verification}} turns on all the properties together, and
the reason this document requires the unrecognised outcome to be distinguished from the
authentic one everywhere it is presented. A verifier that renders a passing verdict from
the presence of a signature, or from integrity alone, converts an attacker's
self-issued certificate into a proof of authenticity. Implementers should treat the
per-property flags as inputs to a single determination, and should avoid exposing an
interface in which a caller can read one flag and skip the others.

## Completeness of the signature's coverage

Several signed container formats permit content to be added after signing. In PDF, an
incremental update appends a revision, leaving a signature that remains cryptographically
valid over a prefix of the file while the file a reader displays has changed. A verifier
that reports such a file as signed and unaltered misreports it.

Completeness is therefore a distinct input to the determination, and this profile requires
the signature to cover the artifact in its entirety. A verifier MUST evaluate completeness
for every form where the underlying format permits partial coverage, and MUST report a
partially covered artifact as altered.

## Log operator trust and the gossip problem {#log-misbehaviour}

A transparency log is operated by a party, and that party is in a position to attempt two
misbehaviours: to serve one relying party a tree that omits an entry it served to
another, and to rewrite history by presenting a tree that diverges from one it previously
signed.

Consistency proofs make the second misbehaviour detectable by any relying party that
retains an earlier Signed Tree Head and checks the current one against it. The first
misbehaviour is detectable only where relying parties compare the heads they were served,
which is the gossip problem, and it is unsolved by proofs alone: a log that maintains two
consistent forks can serve each fork to a disjoint set of relying parties indefinitely.

Anchoring the Signed Tree Head to the ledger of {{the-anchor}} addresses this by giving
every relying party a shared, public place where heads appear. A relying party that
requires every Signed Tree Head it accepts to carry a ledger commitment leaves an
equivocating operator two courses: commit both heads to the same public ledger, where the
two commitments for overlapping tree sizes are visible to anyone who looks, or serve an
uncommitted head that the relying party rejects. The operator can neither withdraw a
commitment already made nor place one earlier than it made it, so anchoring turns a
private equivocation into a public one. A verifier SHOULD therefore reject a Signed Tree
Head with no ledger commitment where the log's policy claims one, since it is the demand
for a commitment on every head that makes the detection work.

Relying parties should still retain the Signed Tree Heads they observe and check
consistency across them, since anchoring makes equivocation evident to an observer who
looks, and the looking is what detection requires. The requirement to publish enough
anchored heads for that audit is stated in {{the-transparency-log}}.

The log key is separate from the subscriber signing keys and chains to the same root. The
Log ID of {{log-id}} is what confines head signing to that one key: without it, any holder
of a subscriber certificate under the same root could mint a head that passes path
validation, and every conclusion in this subsection would rest on that holder's restraint.
Compromise of the log key itself permits forged tree heads while leaving the seals
themselves intact, and the anchored history of previously published heads bounds what a
forged head can be made to say.

## Key compromise and the reach of revocation

The revocation semantics of {{revocation}} deliberately allow seals to survive a
revocation, and the safety of that choice rests entirely on the reason code being applied
correctly.

Where a subscriber key is in another party's hands, the moment that began cannot be
established. Every seal made under the certificate is therefore suspect regardless of
date, and this profile makes `key_compromise` and `ca_compromise` reach all of them. An
implementation MUST use one of those reasons whenever compromise is suspected as well as
when it is proven, and MUST treat an unrecognised reason as compromise, so that the
failure direction of an implementation error is towards distrust.

Where a certificate is retired in good order, seals made before the retirement carry no
such uncertainty. Honouring that case requires evidence of when the seal was made that a
relying party can check without consulting the issuer, since the issuer's own record of
sealing time would let the issuer decide which of its past seals survive. A confirmed
anchor is such evidence. A verifier that honours a time-bounded revocation on any weaker
basis, including a signature timestamp from an authority of the issuer's choosing or a
sealing time asserted by the issuer, has widened the trust it places in named parties.

Compromise of the identity intermediate is bounded by its constraints: it can sign leaf
certificates only, and its extended key usage covers email protection and code signing,
so the certificates issued under the general intermediate are unaffected. That separation
is the reason the two intermediates exist.

## What a seal establishes about a person {#identity-limits}

A seal establishes that the artifact is byte-for-byte what was sealed, and that a
particular certificate produced the signature. Where the certificate carries a `dNSName`
SAN, it further establishes that the subscriber demonstrated control of that domain at
issuance, by one of the methods in {{domain-validation}}. Where the identity profile of
{{identity-profile}} applies, it further establishes that a named identity provider
verified control of a named email address at the moment of sealing.

Each of these is a statement about control of a channel or a key at a moment in time.
Statements about the legal identity of a natural person are the province of a notary or a
supervised trust service, and remain available from those parties where a matter calls
for one. A conforming presentation states the claims a proof carries in the terms above,
and describes a provider-verified email address in exactly those words.

The subject distinguished name deserves particular care. It is a label chosen by the
subscriber, and a presentation that renders it prominently while rendering the
authenticated SAN faintly invites a reader to draw a conclusion the certificate does not
support. See {{issuer-naming}}.

Domain validation itself bounds what a `dNSName` SAN can mean. The DNS method places
trust in the resolution path at the moment of validation, and an attacker able to inject
a TXT record for a domain can obtain a certificate naming it; DNSSEC validation of the
challenge lookup reduces that exposure. The controller email method places trust in the
domain's mail administration.

## Reliance on calendar servers

An OpenTimestamps calendar server aggregates digests and commits them to the ledger. The
proof a calendar returns immediately is a receipt: a promise that the digest will be
committed. That promise is worth exactly the calendar's reliability, which is why this
profile requires a pending anchor to be reported as pending.

The confirmed case is different in kind. A confirmed proof is a path of hash operations
from the artifact's digest to a value recorded in the ledger, and a verifier checks that
path itself and reads the recorded value from the ledger. Producing a false confirmed
attestation therefore requires writing a chosen value into the ledger's history, which is
governed by the ledger's own consensus rather than by the calendar, or finding a SHA-256
collision along the path. A calendar server can delay a commitment, drop one, or commit a
digest of its choosing, and each of those either leaves the anchor pending or produces an
attestation for a digest that fails to match the artifact.

A verifier SHOULD read the ledger through a source it selects, since a verifier that
takes the ledger's contents from the same party that produced the proof has folded the
two independent parts of the proof back into one. Running a full node is the strongest
form of that selection.

An anchor bounds time in one direction: it establishes that the artifact existed by the
ledger position, and it leaves the artifact's earlier history open. Where a claim about
the latest possible moment matters, the anchor's ledger position is the value to cite.

## Algorithms

This profile fixes SHA-256 and ECDSA P-256 throughout. That choice keeps the verification
path small, and it means a future weakening of either primitive requires a new version of
this profile rather than a negotiation within it. The transparency log and the anchor
both commit to SHA-256 digests, so a preimage or collision attack on SHA-256 would reach
the log's leaf structure and the anchor's commitment path as well as the seals.
Implementers should treat the profile version as the unit of algorithm agility, and
should retain the ability to publish a fresh root under a new profile without disturbing
relying parties who pinned the old one for old proofs.

## Privacy

A seal over a digest requires only the digest, so a holder may seal and anchor a
confidential artifact while the artifact stays with them. The forms that embed a
signature into the artifact, namely PAdES, C2PA and XML Signature, require the artifact's
bytes to reach the signer.

A transparency log entry records the artifact's digest, the seal type, the signing
certificate's common name and a timestamp, and it is public and permanent. A party
holding a candidate artifact can therefore confirm that this exact artifact was sealed, a
property that is the point of the log, and one that a sealing party should understand
before sealing an artifact whose existence is sensitive. The identity profile places a
provider-verified email address in a certificate, which appears in the seal.

## Availability

Verification of the core proof uses the artifact, the sidecars and the pinned root, so a
relying party holding those reaches a conclusion while offline, and a proof made today
remains checkable for as long as the relying party retains its copy and the ledger
remains readable. The checks that consult published documents, namely revocation and the
transparency log, require either reachability or a cached copy. A signature on the
revocation list is what gives a cached copy integrity of its own, and a relying party
caching an unsigned list is trusting the transport that delivered it and its own storage
for as long as it keeps the copy. An implementation SHOULD state a maximum age beyond
which a relying party treats a cached revocation list as stale, and SHOULD choose the
behaviour on staleness deliberately, since failing towards distrust converts an outage
into a wave of failed verifications while failing towards trust converts it into a window
for a revoked key.

# IANA Considerations

## Underscored and Globally Scoped DNS Node Name

This document uses the globally scoped underscored DNS node name
`_letsseal-challenge` for the domain validation method in {{domain-validation}}. IANA is
requested to add the following entry to the "Underscored and Globally Scoped DNS Node
Names" registry defined in {{RFC8552}}:

| RR Type | _NODE NAME | Reference |
|---|---|---|
| TXT | _letsseal-challenge | This document |

The registration procedure for this registry is Expert Review {{RFC8552}}.

This version registers the name in use by the deployment this document describes, and the
same choice accounts for the RDATA prefix `letsseal-verify=` in {{domain-validation}} and
the `letsseal.sth.v1` string in {{sth}}: each is the operator's name rather than the
protocol's. A future version of this document may define neutral equivalents, in which
case the neutral name becomes the one an independent implementer publishes and this
document's names remain readable for proofs already made.

No other IANA actions are requested by this document. The seal, anchor and transparency
log profiles reuse existing formats, media types and object identifiers, and define no
new values requiring registration.

--- back

# Verification with Stock Tools

This appendix is informative. It records the commands with which a relying party checks a
SEAL proof using widely available software, with the pinned root in `letsseal-root.crt`.

Detached CAdES/CMS seal:

~~~
openssl cms -verify -inform DER -in file.sig -content file -binary \
    -CAfile letsseal-root.crt
~~~

The `-binary` flag is required: it stops the S/MIME text canonicalisation of the content
before hashing, so that the raw bytes are hashed exactly as they were signed.

S/MIME sealed message:

~~~
openssl smime -verify -in message.eml -CAfile letsseal-root.crt
~~~

XML Signature:

~~~
xmlsec1 --verify --trusted-pem letsseal-root.crt signed.xml
~~~

Anchor:

~~~
ots verify sealed.pdf.ots
~~~

A reference verifier covering the PAdES and detached forms together with the anchor is
published with the implementation {{SEAL-IMPL}}. It accepts a trust anchor supplied by its
operator, as {{trust-anchor}} recommends, so that a self-hosted deployment's root can be
pinned in its place.

# Conformance Vectors

This appendix is informative. A set of test vectors is published with the implementation
{{SEAL-IMPL}}: sealed artifacts paired with the four per-property flags of
{{verification}} step 2 and the outcome of {{verification}} step 4 that a conforming
verifier reports for each, together with the trust anchor to pin and a manifest naming the
expected verdicts. They cover a valid PAdES seal, a byte-modified PAdES file, a seal
chaining to another root, a PAdES file carrying a post-signature incremental update, a
valid detached CAdES seal, and a byte-modified detached seal, which is the set that
exercises the seal forms of {{the-seal}} and the determination of {{verification}}.

The vectors stop there deliberately. A confirmed ledger attestation is produced by the
ledger over hours, so a vector for a confirmed anchor is something a suite can carry only
by fetching one, and a fabricated attestation in a conformance suite would teach an
implementer to accept fabricated attestations. Anchor behaviour and revocation behaviour
are therefore specified in {{the-anchor}} and {{revocation}} and exercised against live
material rather than shipped as offline vectors.

# Acknowledgements
{:numbered="false"}

The design borrows its shape from three bodies of work: the certificate transparency
architecture of {{RFC6962}}, the automated domain validation of {{RFC8555}}, and the
OpenTimestamps proof format {{OPENTIMESTAMPS}}. This document is offered for public
review, and comments are welcome.
