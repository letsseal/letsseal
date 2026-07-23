# Security policy

Let's Seal exists so that a document can be proven authentic by anyone, with no
trust in us. A flaw that lets a seal be forged, a proof be faked, or a
verification result be influenced is the most serious class of bug this project
can have. We want to hear about it early and we will work with you on it.

## Reporting a vulnerability

**Use GitHub private vulnerability reporting.** Open the repository's **Security**
tab and choose **Report a vulnerability**. The report stays private to you and the
maintainers, and it gives us a private fork to develop and review the fix in.

If you would rather use email, write to **security@letsseal.org**. Please put
"vulnerability report" in the subject.

Do not open a public issue, a pull request, or a discussion for a security
finding. Do not post it to social media before the fix ships.

### What to include

The more of this you can give us, the faster the fix lands.

- What the flaw is, and what an attacker gains from it.
- The exact component: the web app, the signing service, the CA hierarchy, the
  transparency log, the anchoring path, the CLI, an SDK, the GitHub Action, or
  the SEAL specification itself.
- A reproduction. A minimal proof of concept beats a description.
- The version, commit, or the hosted URL you tested against.
- Anything you already know about the blast radius.

## What happens next

| Stage | Target |
| --- | --- |
| We acknowledge your report | 3 working days |
| We confirm or reject it, with reasoning | 10 working days |
| Fix shipped for a critical finding | 30 days |
| Public advisory | On release of the fix, or 90 days, whichever is first |

If a finding is critical and actively exploitable we will move faster than the
table and tell you so.

We publish a GitHub Security Advisory for every confirmed finding. You are
credited by whatever name and link you ask for, and you can ask to stay
anonymous. We run no paid bounty.

## Scope

**In scope.** The hosted service at `letsseal.org`, `app.letsseal.org` and
`verify.letsseal.org`; everything in this repository, including the web
application, the signing service, the CA and certificate handling, the RFC 6962
transparency log, the ledger anchoring path, the audit trail, the CLIs, the SDKs,
the GitHub Action, and the SEAL specification.

Findings we consider especially valuable:

- Forging a seal, or making an invalid seal verify as authentic.
- Producing a valid-looking proof for a document that was never sealed.
- Backdating, or otherwise defeating the ledger timestamp.
- Breaking transparency-log append-only behaviour, or forging an inclusion proof.
- Escaping an organisation's tenant boundary, or reading another tenant's
  documents, keys, or audit trail.
- Getting the signing service to issue a certificate for an identity that the
  requester does not control.
- Tampering with the audit chain without detection.

**Out of scope.** Findings that require the operator's own host or database to be
already compromised; social engineering of our staff or users; physical attacks;
volumetric denial of service; missing hardening headers with no demonstrated
impact; scanner output with no working proof of concept; and reports about third
party services we consume rather than about our use of them.

## Safe harbour

Research carried out in good faith under this policy is authorised, and we will
not pursue legal action over it. Stay within these lines:

- Test against your own organisation and your own documents.
- Access only the minimum data needed to demonstrate the flaw, and delete it
  afterwards. If you encounter someone else's data, stop and tell us.
- Leave the service running for other people. No volumetric testing, no spam, no
  degradation of the verification path.
- Give us the reporting window above before going public.

## Verifying a release

Every tagged release is sealed by CI: the source archive carries a
cosign-compatible signature and a SLSA provenance attestation, and its digest is
timestamped on the public ledger. `SHA256SUMS` covers every published asset. You
can check all of it with stock `cosign` and `ots`, with no Let's Seal software
involved. That is the point.

## Supported versions

Let's Seal ships from `main` and the hosted service tracks it. Security fixes
land on `main` and in the next tagged release. Older tags receive fixes only when
a self-hosting adopter is known to be pinned to one.
