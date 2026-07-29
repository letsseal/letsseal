# Implementations of SEAL

**Anyone may implement [SEAL](SPEC.md), royalty-free.** The standard is published so
that a sealed file can be issued by one tool and verified by another, written by
someone else, years later, with no permission asked.

This page lists the implementations we know about, and shows how to write one.

## Known implementations

| Implementation | Language | Role | Formats | Where | Status |
|---|---|---|---|---|---|
| Let's Seal signing service | Python (FastAPI, pyHanko, c2pa-python, signxml, OpenTimestamps) | Issuer and verifier | PDF (PAdES, B-T when the TSA answers), image/video/audio (C2PA), XML (XML-DSig), email (S/MIME), any file (detached CAdES/CMS), cosign blob, container image, in-toto attestation, identity profile, log STH signing | [`signing-service/`](signing-service/) | Reference; runs in production |
| SEAL reference verifier | Python (pyHanko, `openssl`, `ots`) | Verifier | PDF (PAdES), any file (detached CMS), anchor | [`spec/verify.py`](spec/verify.py) | Reference; the executable companion to §8 |
| Let's Seal app | TypeScript (Next.js) | Client | PDF, C2PA media, XML, S/MIME, detached CMS, cosign blob | [`web/`](web/) | Production; serves proof pages at `/d/<sha256>`, the verify API, evidence bundles, and an RFC 6962 transparency log ([`web/lib/merkle.ts`](web/lib/merkle.ts)) |
| sealbot (Rust) | Rust | Client | Local hashing then service-issued anchoring for any file; sealing and verification of PDF, C2PA media, XML, S/MIME, detached `.sig`, cosign blob, container image, attestation | [`cli-rs/`](cli-rs/) | Released; single static binary |
| sealbot (Node) | JavaScript (Node 18+) | Client | Local hashing then service-issued anchoring for any file; PDF sealing and verification; folder watching | [`cli/`](cli/) | Published on npm; the Rust binary is the one to reach for now |
| sealbot GitHub Action | JavaScript (Node 24) | Client | `anchor`, `sign` (cosign-compatible signature + SLSA provenance), `seal` (PDF), `verify` | [`ci/github-action/`](ci/github-action/) | Production; cuts this repository's own releases |
| Let's Seal SDKs (hand-written) | TypeScript, Python | Client (issuer side) | Sealing across every format, PDF verification, anchoring; hand-written and dependency-free | [`sdk/ts/`](sdk/ts/), [`sdk/python/`](sdk/python/) | Published |
| Let's Seal SDKs (generated) | Go, Java, PHP, Ruby, C# | Client | Every service endpoint | [`sdk/generated/`](sdk/generated/) | Generated from [`sdk/openapi.json`](sdk/openapi.json) |

**Role** uses the two conformance roles [CONFORMANCE.md](CONFORMANCE.md) defines, plus
one word for everything else. A **verifier** takes an artifact, with its `.ots` for time,
and reports a verdict. An **issuer** holds or obtains a certificate under the published
root, signs artifacts in their format-native form, anchors them, and publishes the proof.
A **client** drives a service that does the keyed work, so its conformance claim rests
with that service.

Two things worth reading off that table. The CLIs, SDKs, Action and the app are
clients: they hash locally, so only the 32-byte digest leaves the machine, and they
obtain the anchor and hand keyed sealing and signature checking to a signing service. The
paths that stand on their own are [`spec/verify.py`](spec/verify.py) and the stock tools
the spec names (`openssl cms`, `xmlsec1`, `cosign`, `ots`).

And every row above comes from this project. That is exactly the gap this page exists
to close.

## Writing your own

**Write a verifier first.** It is the half the world needs more of, it works from
public inputs alone (the file, its sidecars, and the published trust material), and it
can be built out of libraries your language already has.

Three documents, in this order:

1. [**SPEC.md §8**](SPEC.md#8-verification-algorithm-normative) is the normative
   algorithm. It is short on purpose.
2. [**CONFORMANCE.md**](CONFORMANCE.md) is the checklist, item by item: C-1 to C-43 for
   a verifier, C-44 to C-57 for an issuer, C-58 to C-60 for the self-test.
3. [**`spec/vectors/`**](spec/vectors/) holds the test vectors with their expected
   verdicts. Run yours against them; the `require` block in
   [`manifest.json`](spec/vectors/manifest.json) is the contract, and `observed` is the
   reference verifier's own output for comparison. The vectors are issued by a throwaway
   CA that ships with them, so point your verifier at `spec/vectors/root.crt` when you
   run them, the way `python spec/verify.py --root spec/vectors/root.crt ...` does.
   Pinning the published root is for real seals.

The six shipped vectors cover the seal, which is SPEC.md §2 and §8, across PDF and
detached CMS. Anchor and revocation vectors are specified in
[`spec/vectors/DESIGN.md`](spec/vectors/DESIGN.md) and ship once real proofs exist to
build them from: a confirmed ledger attestation takes ledger time to earn, and a
fabricated one would hollow out the suite.

Conformance is claimed per role and per format. A verifier that handles PDFs alone is a
conformant SEAL verifier for PDF and says so, naming the formats it covers and the
vectors it ran (C-58).

What a minimal verifier needs:

- **A signature library.** For PDFs, a PAdES-capable one (pyHanko in Python, or your
  language's CMS/AdES tooling). For the detached `.sig` case, stock `openssl` is
  enough:
  ```
  openssl cms -verify -inform DER -in file.sig -content file -binary -CAfile letsseal-root.crt
  ```
- **The published root**, pinned by its SHA-256 fingerprint:
  ```
  Subject:  CN=Let's Seal Root CA, O=Let's Seal, C=GB
  SHA-256:  02:68:6D:EE:20:67:31:C4:59:C1:7A:9F:58:36:7B:0B:0B:BA:5D:24:C6:85:D8:6D:1F:74:49:86:2D:C0:FE:BE
  ```
  Published at <https://letsseal.org/trust>, downloadable at
  <https://letsseal.org/api/root-ca>.

  The chain runs root, then intermediate, then the signing leaf. Keep the published
  intermediate to hand as chain-building material, so a path builds from whatever the
  seal itself carries, while trust stays pinned to the root fingerprint alone.
  [`spec/verify.py`](spec/verify.py) embeds it for that reason:
  ```
  Subject:  CN=Let's Seal Intermediate CA, O=Let's Seal, C=GB
  SHA-256:  CD:7D:88:96:CB:F4:96:B0:0D:C6:2B:A1:4C:9C:A0:3D:E3:4A:E5:20:C0:08:DA:59:19:96:63:E4:64:85:D1:AF
  ```
- **The OpenTimestamps client** for the anchor: `ots verify -f sealed.pdf sealed.pdf.ots`
  reads the proof against the file it commits to and reports the ledger attestation.
  Time comes from there: **confirmed** once the attestation has landed, **pending**
  while a calendar receipt is all there is.
- **The published revocation list** at <https://letsseal.org/revocations.json>, checked
  against its own signature rather than against the transport that delivered it, so it
  can be fetched once, cached, and used offline. The reason code decides the reach: some
  reach back over every seal made under the certificate, others leave seals dated before
  the revocation standing, with a confirmed anchor as the evidence of date. The semantics
  are in [CONFORMANCE.md §5](CONFORMANCE.md#5-verifier-revocation) (C-38 to C-43).

The rule the whole thing turns on: **authentic = intact AND valid AND chains to the
pinned root AND covers the entire file.** All four, every time.

`intact` and `valid` are separate checks and stay separate: `intact` says the digest over
the signed byte range still matches the bytes in hand, and `valid` says the signature
object itself verifies. An altered document can report `valid` true and `intact` false, as vector 002 does, so
keeping the two apart is what lets a verifier tell a tampered file from an issuer
problem. A cryptographically valid signature from a certificate outside the pinned root MUST be
reported as unrecognised. A signature that covers less than the whole file MUST be
reported as altered, whatever else checks out; that is the case
`004-pades-incremental-update` exists to catch.

Three verdicts fall out of that, and C-59 requires a verifier to distinguish them:
**authentic**, **unrecognised** and **altered**. Anchor state is reported separately, as
**confirmed** or **pending**; a pending anchor is a calendar's promise, so proof of time
waits for the confirmation (C-27, C-28, C-60). For a file that carries no signature,
[`spec/verify.py`](spec/verify.py) prints `NOT A SEAL` and the sealbot CLIs print
`unsealed`; that wording is a product choice, sitting alongside the verdict vocabulary
rather than inside it.

To prove you got it right: run your verifier over
[`spec/vectors/`](spec/vectors/) and compare verdict for verdict against each vector's
`require` block, then cross-check a file of your own against
[`spec/verify.py`](spec/verify.py). Agreement on both, for the formats you claim, is the
bar.

## Add yours

Two ways, both welcome:

- **Open a pull request** adding a row to the table above: name, language, role,
  formats, link, and an honest status. Work in progress is a fine status; say so in
  the row.
- **Start a discussion** at <https://github.com/letsseal/letsseal/discussions> if you
  would rather talk it through first, or open an issue.

Listing is a signpost. Use "Let's Seal" and "SEAL" to describe what your tool conforms
to, rather than to imply endorsement (see [SPEC.md §12](SPEC.md#12-license)).

## What we would find most useful

**An independent verifier in a language other than Python or JavaScript.** Go, Rust,
Java, C#, Swift, anything.

A verifier written by someone else, from the text of the specification, that agrees
verdict for verdict with the vectors, is the strongest evidence there is that the
specification is implementable from the text alone. Where yours disagrees with ours,
that is a specification bug and we want to hear about it: open an issue with the file,
the vector, and the two verdicts, and §8 gets fixed.
