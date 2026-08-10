# Let's Seal Certificate Policy and Certification Practice Statement

**Version 1.0** · Effective 2026-07-28
Policy identifier: <https://github.com/letsseal/letsseal/blob/main/CPS.md> (this document,
at the version above)

This document follows the framework of **RFC 3647**. It states the practices under which
the Let's Seal Certificate Authority issues, publishes, manages and withdraws
certificates, so that anyone relying on a SEAL proof can decide how much weight to give
it by reading how it was made.

It is written to be checked against the code. Every practice below corresponds to
something in this repository, and the relevant path is named so a reader can confirm the
statement rather than take it on faith. Where practice and this document ever disagree,
that is a defect in one of them, and reporting it is welcome: see [SECURITY.md](SECURITY.md).

---

## 1. Introduction

### 1.1 Overview

The Let's Seal CA issues certificates for **sealing artifacts**: documents, images, XML,
email messages, software artifacts and container images. A certificate issued under this
policy is used to make a signature that establishes two things about an artifact: that it
is byte-for-byte what was sealed, and which certificate sealed it. Time is established
independently by the anchor described in [SPEC.md](SPEC.md) §3, and remains verifiable on
its own terms.

Trust under this policy is **pinned to a published root**. A relying party obtains the
root, verifies its fingerprint against the published value, and from then on decides for
itself which certificates it accepts. That decision belongs to the relying party and
requires no agreement with Let's Seal.

### 1.2 Document name and identification

| Field | Value |
|---|---|
| Document | Let's Seal Certificate Policy and Certification Practice Statement |
| Version | 1.0 |
| Effective | 2026-07-28 |
| Location | `CPS.md` in the public repository |
| Applies to | The Let's Seal Root CA and every CA and certificate beneath it |

### 1.3 PKI participants

**Certification Authority.** The Let's Seal CA, comprising the Root CA, the Intermediate
CA, and the Identity CA described in §1.3.1. Operated by the entity named at
<https://letsseal.org/trust>.

**Registration Authority.** The Let's Seal application performs registration: it
establishes the account, runs domain validation (§3.2.2), and requests issuance. Its code
is public.

**Subscribers.** Organisations and individuals who hold a certificate and seal artifacts
with it. A self-hosted deployment is its own CA and its own subscriber, under its own
root.

**Relying parties.** Anyone verifying a sealed artifact. Verification uses stock tools:
a PDF reader for PAdES, `ots` for the anchor, `cosign` for supply-chain artifacts,
`openssl` for detached CMS and S/MIME. A relying party who pins the published root has
everything required.

#### 1.3.1 Certification hierarchy

```
Let's Seal Root CA                     EC P-256, 20 years, key held offline
├── Let's Seal Intermediate CA         EC P-256, 10 years, pathlen:0
│   └── subscriber certificates        EC P-256, 5 years
│       ├── document profile           sealing documents, images, XML, email
│       ├── code profile               sealing software artifacts and images
│       └── data profile               general attestation over data
└── Let's Seal Identity CA             EC P-256, 10 years, pathlen:0, EKU-constrained
    └── identity certificates          minted on demand after provider verification
```

The Identity CA exists so that on-demand issuance and offline issuance are separated. An
identity certificate is minted at the moment a person completes a provider verification,
which requires an issuing key to be available online. That key is therefore held by a
separate intermediate, constrained by `pathlen:0` and by extended key usage to
email protection and code signing, so its authority covers identity certificates and
stops there. The Root CA key remains offline throughout.

Reference: `ca/setup-ca.sh` (`init_ca`, `identity_init`).

### 1.4 Certificate usage

**Appropriate uses.** Sealing artifacts so that their integrity and their issuing
certificate can be established by anyone, at any later time, using public standards and
the published root.

**What a seal asserts.** A seal asserts the integrity of the sealed bytes and the identity
of the certificate that produced it. Where the certificate carries a `dNSName` SAN, it
additionally asserts that the subscriber demonstrated control of that domain at issuance
(§3.2.2). Where it carries a verified email binding, it asserts that a third-party
identity provider verified that address at the time of sealing.

Presentations of a SEAL proof state these claims as they are. Attribution of a natural
person's legal identity is the province of a notary or a qualified trust service provider,
and remains available from those parties where a matter calls for it.

### 1.5 Policy administration

This document is maintained in the public repository. Changes are proposed by pull request
and are visible in full history. Questions and objections go to the contact at
<https://letsseal.org/trust>; security matters follow [SECURITY.md](SECURITY.md).

---

## 2. Publication and repository responsibilities

### 2.1 Repository

The following are published, and stay published:

| Artifact | Location |
|---|---|
| Root CA certificate | <https://letsseal.org/api/root-ca> |
| Root fingerprint, in human-checkable form | <https://letsseal.org/trust> |
| Revocation list | <https://letsseal.org/revocations.json> |
| Transparency log: signed tree head | <https://letsseal.org/api/log/sth> |
| Transparency log: inclusion proof | <https://letsseal.org/api/log/proof> |
| Transparency log: consistency proof | <https://letsseal.org/api/log/consistency> |
| This document | <https://github.com/letsseal/letsseal/blob/main/CPS.md> |
| The standard being implemented | [SPEC.md](SPEC.md) |
| The implementation, in full | <https://github.com/letsseal/letsseal> |

### 2.2 Root fingerprint

```
Subject:  CN=Let's Seal Root CA, O=Let's Seal, C=GB
SHA-256:  02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE
```

A relying party verifies this fingerprint once, by whatever channel it considers
authoritative, and pins it. Everything else in the system follows from that one act.

### 2.3 Frequency of publication

The revocation list is republished on every change. The transparency log accepts entries
continuously, and its Signed Tree Head is anchored to the public ledger, which pins the
log's history to a clock outside this CA's control (see SPEC.md §6).

---

## 3. Identification and authentication

### 3.1 Naming

Subscriber certificates carry a subject of the form `CN=<label>, O=<label>, C=GB`, where
the label is chosen by the subscriber. **The authenticated identity lives in the
subjectAltName**, and relying parties read it there:

| SAN | Meaning |
|---|---|
| `URI:https://letsseal.org/o/<slug>` | The subscriber's stable namespace, present on every organisation certificate |
| `DNS:<domain>` | The subscriber demonstrated control of this domain (§3.2.2) |

A certificate carrying the URI SAN alone denotes a **self-asserted issuer name**: the
seal's integrity and time claims stand on their own, and the displayed name is the
subscriber's own claim. Presentations distinguish the two cases plainly, because the
difference is the whole value of the domain check.

Reference: `ca/setup-ca.sh` (`issue_org`, `reissue_org`), SPEC.md §2.

### 3.2 Initial identity validation

#### 3.2.1 Account authentication

An account is authenticated to an email address, through a third-party identity provider
where the subscriber uses one.

#### 3.2.2 Domain validation

Binding a `dNSName` SAN requires the subscriber to demonstrate control of that domain by
one of two methods, both of which are checked by the service rather than asserted by the
subscriber:

**DNS method.** The subscriber publishes a TXT record at
`_letsseal-challenge.<domain>` containing `letsseal-verify=<token>`, where the token is
issued per challenge. The challenge is valid for 7 days.

**Controller email method.** A confirmation is sent to one of the recognised controller
aliases at the domain: `admin`, `administrator`, `postmaster`, `hostmaster`, `webmaster`.
The challenge is valid for 24 hours. Domains belonging to public mailbox providers are
handled as personal mailboxes rather than as organisational domains, so this method
applies to domains the subscriber administers.

Superseding a pending challenge retires the earlier one, so exactly one token is live for
an organisation and domain at a time.

Reference: `web/lib/domain-verify.ts`.

#### 3.2.3 Key generation and possession

Two flows are supported, and the distinction matters to a relying party:

**Subscriber-held key.** The subscriber generates a key, submits a CSR, and the CA signs
it. The subject is pinned by the CA from validated data, and extensions come from the
CA-side profile, so the certificate says what the CA verified. This is the flow to use
where sole control of the key is a requirement.

**Service-held key.** For the hosted signing service, the key is generated at issuance and
held in a PKCS#12 bundle protected by a passphrase supplied from the environment, on a
service bound to localhost. Re-issuance reuses the existing key, so an organisation's
identity stays stable when a newly verified domain is bound.

Reference: `ca/setup-ca.sh` (`sign_csr`, `issue_cert`).

### 3.3 Re-key and re-issuance

Re-issuance follows the same validation as initial issuance. Binding a newly verified
domain re-issues the certificate with the additional SAN and preserves the key.

---

## 4. Certificate life-cycle operational requirements

### 4.1 Application and issuance

Issuance follows successful validation under §3. Every certificate receives a serial with
**128 bits of entropy**, with the high bit cleared so the DER INTEGER is unambiguously
positive. This meets the CA/Browser Forum's entropy requirement, and it matters because a
predictable serial makes a certificate's to-be-signed bytes predictable, which is the
precondition for a chosen-prefix collision attack.

Reference: `ca/setup-ca.sh` (`_serial`).

### 4.2 Certificate acceptance and publication

Seals are recorded in the public transparency log described in SPEC.md §6, so that
issuance is observable by third parties and mis-issuance is detectable by anyone, rather
than only by this CA.

### 4.3 Key pair and certificate usage

Subscribers use the certificate for the purpose its profile expresses (§7.1). Relying
parties verify the signature, verify the chain to the pinned root, confirm coverage of the
entire artifact, and consult the revocation list (§4.9).

### 4.4 Certificate renewal

Subscriber certificates are valid for 5 years. Renewal repeats validation.

### 4.9 Certificate revocation

**Grounds.** A certificate is revoked on subscriber request, on evidence of key
compromise, on a finding of impersonation or abuse, or on the orderly retirement of a
certificate.

**Mechanism.** Revocations are published as a signed list at
<https://letsseal.org/revocations.json>. The list carries its own integrity through a
signature by the log key, so it can be fetched once, cached, and relied upon independently
of the transport that delivered it. Verification therefore stays available to a relying
party working offline, and a proof continues to stand on its own.

The signature is ECDSA on P-256 over SHA-256, base64 in the `signature` member, and the
signing certificate and its chain travel in the same document as `logCert` and `logChain`,
so a relying party needs one fetch and no separate key distribution. SPEC.md §8.5 fixes
the bytes it covers: the tag `letsseal.revocations.v1`, then canonical JSON of `version`,
`updated_at` and `revoked`. The signing key is the transparency log's, which already
chains to the published root, so this adds no key material a relying party must learn
about separately. Reference: `signing-service/translog.py` (`sign_revocations`),
`signing-service/revocation.py` (`published`).

Should the signature be unavailable when the list is served, the list is published without
it rather than withheld. A CA that cannot reach its key can still say which certificates
are withdrawn, and a relying party consulting an unsigned list is in the position everyone
was in before the signature existed. What a relying party must not do is treat a list whose
signature fails to verify as a list at all; SPEC.md §8.3 step 5 requires that be reported
as an unchecked revocation state.

**Reason codes decide how far back a revocation reaches.** This is the part of revocation
that decides whether honest evidence survives, and it is stated here so subscribers and
relying parties can both rely on it:

| Reason | Effect on seals made before the revocation |
|---|---|
| `key_compromise`, `ca_compromise`, `unspecified` | Untrusted, whatever their date. The key was in another party's hands from a moment nobody can establish, so every seal under it is affected. |
| `superseded`, `cessation_of_operation`, `affiliation_changed`, `privilege_withdrawn` | Trusted. The key was retired in good order, so seals demonstrably made before the revocation date stand. |
| A reason a verifier does not recognise | Handled as `key_compromise`. For a trust decision, the safe direction is the strict one. |

`unspecified` sits in the first row for the same reason the last row does. A reason
that says nothing about how a key was lost cannot support the claim that earlier
seals are safe, so it is classified with the strict cases rather than the orderly
ones. The issuing tooling and the verifier derive that classification from the same
list, so an operator is told at revocation time exactly what a relying party will
later conclude.

The time-bounded case is meaningful here because the anchor supplies **independent
evidence of when a document existed**. A confirmed anchor places the seal before a given
public-ledger block, which a relying party can check without consulting this CA. That is
what allows an orderly retirement to leave years of honest evidence standing.

Reference: `signing-service/revocation.py`, `ca/setup-ca.sh` (`revoke_cert`).

**Withdrawal of a mistaken entry.** An entry recorded in error is removed by the same
tooling, which exists for administrative correction. A revocation recorded for compromise
stands.

---

## 5. Facility, management and operational controls

### 5.1 Physical and logical controls

The Root CA key is held offline and is used for one purpose: signing the intermediates
listed in §1.3.1. Online components hold the intermediate and subscriber keys they need
and nothing further.

The signing service binds to localhost. Access to it is authenticated by a service token,
and requests carrying signing keys never traverse a public interface.

Reference: `signing-service/run.sh`.

### 5.2 Procedural controls

Issuance, re-issuance and revocation are performed by the documented commands in
`ca/setup-ca.sh`, which validate their inputs at the CA boundary. Subject values are
screened for DN metacharacters so that a caller cannot inject additional relative
distinguished names, in addition to the validation performed by the service.

### 5.4 Audit logging

The application maintains a tamper-evident audit chain over the events that make up a
signing session, where each event commits to the prior state and holds a total order
independent of wall-clock time. Seals are recorded in the public transparency log, whose
history is anchored to the public ledger.

Reference: `web/lib/audit.ts`, SPEC.md §6.

### 5.7 Compromise and disaster recovery

On evidence of subscriber key compromise, the certificate is revoked with reason
`key_compromise`, which withdraws trust from every seal under it whatever its date (§4.9).

On evidence of compromise of the Identity CA, that intermediate is revoked with reason
`ca_compromise`. Its constraints bound the consequences to identity certificates: it can
sign leaves only, and its extended key usage covers email protection and code signing, so
document and organisation certificates issued under the main intermediate are unaffected.
This separation is the reason the Identity CA exists.

The Root CA key being offline is what makes recovery from any online compromise possible:
a new intermediate can be issued under the same published root, and relying parties who
pinned that root need do nothing.

---

## 6. Technical security controls

### 6.1 Key pair generation

All keys are EC P-256. Signatures use SHA-256. Root and intermediate keys are generated at
CA setup; subscriber keys are generated either by the subscriber (§3.2.3) or at issuance.

### 6.2 Private key protection

Subscriber keys held by the service are stored in PKCS#12 bundles encrypted under a
passphrase supplied from the environment. The tooling refuses to run without that
passphrase rather than falling back to a default, so a guessable default cannot exist.

### 6.4 Activation data

The PKCS#12 passphrase is supplied to the service at start-up from its environment and is
held only in memory.

---

## 7. Certificate and revocation list profiles

### 7.1 Certificate profile

All certificates: X.509 v3, ECDSA P-256, SHA-256, 128-bit random serial.

| Profile | Basic constraints | Key usage | Extended key usage | Used for |
|---|---|---|---|---|
| Root | `critical, CA:TRUE` | `critical, keyCertSign, cRLSign` | | Signing intermediates |
| Intermediate | `critical, CA:TRUE, pathlen:0` | `critical, keyCertSign, cRLSign` | | Signing subscriber certificates |
| Identity CA | `critical, CA:TRUE, pathlen:0` | `critical, keyCertSign, cRLSign` | `emailProtection, codeSigning` | Signing identity certificates |
| document | `critical, CA:FALSE` | `critical, digitalSignature, nonRepudiation` | `emailProtection` (1.3.6.1.5.5.7.3.4) | Documents, images, XML, email |
| code | `critical, CA:FALSE` | `critical, digitalSignature` | `codeSigning` | Software artifacts, container images |
| data | `critical, CA:FALSE` | `critical, digitalSignature, nonRepudiation` | | General data attestation |
| identity | `critical, CA:FALSE` | `critical, digitalSignature, nonRepudiation` | `emailProtection, codeSigning` | Provider-verified person identity |

The `document` profile satisfies the C2PA certificate profile (C2PA 2.x §14.5.1), which is
what allows a sealed image to be read by any C2PA-aware tool. The `code` profile carries
the extended key usage `cosign` requires, which is what allows a sealed build artifact to
be verified with stock `cosign`.

Validity: root 20 years, intermediates 10 years, subscriber certificates 5 years.

### 7.2 Revocation list profile

The revocation list is a signed JSON document. Each entry carries the certificate serial
in lowercase hexadecimal, the subject, the reason code (§4.9), the revocation timestamp in
UTC, and an optional note. Entries are ordered by revocation time.

### 7.3 Transparency log profile

Defined normatively in SPEC.md §6: RFC 6962 Merkle tree, leaves
`SHA-256(0x00 ‖ canonical-JSON{sha256, sealType, certCN, ts})`, interior nodes
`SHA-256(0x01 ‖ left ‖ right)`, and a Signed Tree Head over
`letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n` signed by a dedicated log key whose
certificate chains to the root. Inclusion and consistency proofs are served for anyone to
check, using standard RFC 6962 arithmetic and no trust in this server.

---

## 8. Compliance audit and other assessments

The assurance offered here is **public verifiability**, and it is offered continuously
rather than annually:

- The implementation is published in full under Apache-2.0, so the practices in this
  document can be read in the code that performs them.
- Every seal is recorded in a public, append-only transparency log with inclusion and
  consistency proofs, so mis-issuance is detectable by any third party.
- The log's own history is anchored to a public ledger beyond this CA's reach, so the
  record of what was issued is pinned to an outside clock.
- Verification runs on stock third-party tools, so a relying party's conclusion is
  reached with software this CA had no hand in.

Independent review is actively sought, both of this document and of
[SPEC.md](SPEC.md). Findings, in public or through [SECURITY.md](SECURITY.md), are
welcome and will be answered.

---

## 9. Other business and legal matters

### 9.1 Fees

Issuance, sealing and verification carry no fee. Verification in particular is free to
everyone, permanently and without an account, which is the founding purpose of this
service.

### 9.4 Privacy

Sealing may be performed on a digest alone: the CLI hashes locally and transmits the
SHA-256, so a subscriber can anchor and prove the existence of a confidential document
while the document itself stays on their own machine. Proof pages are addressed by digest.

Reference: `cli/sealbot.mjs`.

### 9.6 Representations and warranties

**The CA warrants that:** it issues certificates in accordance with this document; it
validates domain control by the methods in §3.2.2 before binding a `dNSName`; it records
seals in the public transparency log; it publishes revocations promptly at the stated
location; and it keeps the Root CA key offline.

**The subscriber warrants that:** the information supplied for validation is accurate;
they hold sole control of any key they generate; and they seal artifacts they are entitled
to seal.

**The relying party is responsible for:** pinning the published root, verifying the chain,
confirming that the signature covers the entire artifact, and consulting the revocation
list. SPEC.md §8 states the verification algorithm normatively, and the rule it turns on is
that an artifact counts as authentic when the signature is valid **and** intact **and**
chains to the pinned root.

### 9.7 Scope of liability

Liability is limited to the correct performance of the practices stated in this document.
The claims a certificate carries are those set out in §1.4 and §3.1, and they are the
claims on which a relying party's reliance is properly founded.

Matters requiring a supervised trust service, a notary, or a qualified certificate remain
the province of those parties, and this CA's certificates sit alongside such instruments
rather than in place of them.

### 9.12 Amendments

Amendments are made in public, in the repository, with full history. Material changes
increment the version and the effective date at the head of this document. Prior versions
remain retrievable from the repository, so a relying party can read the policy that was in
force when a given certificate was issued.

### 9.16 Self-hosted deployments

A self-hosted deployment operates **its own CA under its own root**, and this document
describes the Let's Seal service rather than that deployment. An operator who publishes a
policy of their own puts their organisation's name behind their own root, holds their own
keys, and answers for their own issuance. The tooling in `ca/setup-ca.sh` produces the same
hierarchy, profiles and revocation semantics described here, so this document serves as a
template worth adapting.
