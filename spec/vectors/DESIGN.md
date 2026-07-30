# SEAL test vector suite: design

**Status:** design, partly built. This document specifies the suite. It defines the vectors,
the verdict fields a verifier reports, the `manifest.json` index a harness iterates, and what
the suite ships. Six vectors are published and running in CI already; §2.4 says which, and
how the rest lands beside them. Generating the remaining artifacts is a separate step and is
performed by a generator written from this document.

**Why the suite exists.** SPEC.md §8 gives the verification algorithm. A second
implementation can read it, write code, and still have no way to tell whether that code is
right. The suite closes that gap: a fixed set of sealed artifacts, each with an exact
expected verdict, so an implementer runs their verifier over the tree and gets a pass or a
fail per vector. It turns "I think I read §8 correctly" into a measurement, which is the
condition under which independent implementations get written at all.

**Conformance statement.** [CONFORMANCE.md](../../CONFORMANCE.md) is the normative
checklist, and this suite is the evidence for it: C-58 binds a conformance claim to
reproducing the verdict recorded in `spec/vectors/manifest.json` for every vector covering a
format the implementation claims. An implementation conforms to SEAL 1.1 core verification
when it reports the required verdict for every vector in the **core** tier, which exercises
C-1 to C-17 for the seal, C-25 to C-31 for the anchor, and the self-test items C-58 to C-60.
The **extended** tier covers the additional seal forms and profiles, and an implementation
claims conformance for the forms it supports.

The six published vectors cover SPEC.md §2 and §8, so C-58 is testable today for the seal.
The anchor and revocation vectors are specified here and stay unshipped until they can be
made honestly: a confirmed ledger attestation cannot be manufactured offline, and a
fabricated one would undermine the only thing a conformance suite is for (§2.4).

SPEC.md §8.4 fixes the verdict vocabulary a conforming verifier reports, and the precedence
it applies them in: **unsealed**, **altered**, **unrecognised**, **authentic**. SPEC.md §3.1
fixes the anchor states: **confirmed**, **pending**, **absent**, **unverified**. The anchor
state and the revocation state are reported alongside the verdict rather than folded into it,
which is what lets one vector here read `authentic` with a listed revocation beside it (010)
and another read `authentic` with time still unproven (007).

This suite reports two fields besides, because several vectors need a finer answer than the
verdict alone: the `reason` vocabulary of §1.1 and `issuerVerified`. Both are proposed
additions to CONFORMANCE.md, recorded in [§7](#7-open-questions-and-work-items). A harness
compares them for an implementation that reports them and records them as not applicable for
one that does not (§5).

---

## 1. The verdict a verifier reports

Every vector's expectation is a set of fields with fixed types. These are the fields a
conforming verifier reports, and the names the manifest uses.

| Field | Type | Meaning |
|---|---|---|
| `sealed` | boolean | A SEAL signature was found for this artifact: embedded (PAdES, C2PA, XML-DSig, S/MIME) or a detached CMS sidecar supplied alongside it. |
| `intact` | boolean | The covered bytes still hash to the digest the signature commits to. This is the content check on its own, with the chain and the signing key set aside. |
| `valid` | boolean | The signature in the CMS object verifies under the public key in the signing certificate. This is the cryptographic check on its own, with the chain set aside. It is a separate axis from `intact`: pyHanko computes `valid` over the signed attributes and `intact` over the covered content, so an altered document reports `valid: true` with `intact: false`, which is what vector 002 shows. |
| `trusted` | boolean | The signing certificate path-validates to the pinned SEAL root (SPEC.md §8.1) and is within its validity window at the moment §1.4 names. A revocation that reaches this seal withdraws trust, so `trusted` reads false there, and `revocationState` with the `revocation` object says why. |
| `coverage` | enum | What the signature covers: `entire_file`, `contiguous_block_from_start`, `entire_revision`, `other`, `none`. SPEC.md §8.2 defines completeness per format, so `coverage == "entire_file"` is the `entire_file` fact of SPEC.md §8.1 for the form under test. |
| `authentic` | boolean | `intact ∧ valid ∧ trusted ∧ coverage == "entire_file"`, evaluated on an artifact where `sealed` holds. SPEC.md §8.1 names those four facts and §8.4 makes SEAL-authenticity their conjunction: all four, with a passing verdict from no subset of them, and in particular none from the presence of a signature alone. CONFORMANCE.md states the same rule as C-6 and C-8. `spec/verify.py` computes exactly this four-term conjunction, and `manifest.json` records it. |
| `verdict` | enum | The single word a user interface shows, from SPEC.md §8.4: `unsealed`, `altered`, `unrecognised`, `authentic`, applied in the precedence of §1.2. |
| `anchorState` | enum | The four states of SPEC.md §3.1: `confirmed`, `pending`, `absent`, `unverified`. Reported alongside the verdict. |
| `revocationState` | enum | `checked-clear`, `revoked`, `unchecked`, from SPEC.md §8.3 step 5. Reported alongside the verdict. `unchecked` is what a verifier that cannot reach the list says, and it is the honest answer offline; `checked-clear` covers both a certificate absent from the list and one listed under a revocation that leaves this seal standing. |
| `reason` | string or null | Stable machine-readable cause when `authentic` is false; `null` when it is true. |

Two further fields are recommended and are asserted where a vector specifies them:

| Field | Type | Meaning |
|---|---|---|
| `issuerVerified` | boolean | The signing certificate carries a `dNSName` SAN **and** `trusted` holds. SPEC.md §2 is explicit that the subject `CN` is a label chosen by the sealing account, so a verifier reports issuer identity from the SAN. |
| `revocation` | object or null | `{ "listed": true, "reason": string, "effect": "unconditional"\|"time_bounded"\|"none", "appliesToThisSeal": bool }`, with an optional `revokedAt`. The object is present exactly when the list was reached and the signing certificate appears in it, whatever the outcome, so `listed` is always `true` where the object exists and `null` carries the other cases, which `revocationState` distinguishes. `revokedAt` is carried where the harness has the list in hand and is omitted from the expectations in §3, which assert the reading rather than the date. |

### 1.1 `reason` vocabulary

`no_seal`, `content_modified`, `signature_invalid`, `coverage_partial`, `untrusted_root`,
`chain_incomplete`, `certificate_expired`, `certificate_revoked`.

### 1.2 `verdict` precedence

SPEC.md §8.4 fixes this order, and a verifier stops at the first match:

1. `sealed == false` → `unsealed`
2. `intact == false` **or** `valid == false` **or** `coverage != "entire_file"` → `altered`
3. `trusted == false`, whether because the chain reaches a root the verifier was never
   given, because the chain is incomplete, because the certificate is outside its validity
   window at the moment of §1.4, or because a revocation reaches this seal → `unrecognised`
4. otherwise → `authentic`

The `unrecognised` wording is normative in SPEC.md §8.4: a valid signature from a
certificate outside the pinned root is a forgery vector and is reported as unrecognised. A
revocation that reaches a seal lands in the same row, because it withdraws the trust the
fourth row requires, and `revocationState` with the `revocation` object beside the verdict
carries what separates it from a foreign chain. That is the point of reporting revocation
alongside the verdict: the verdict stays one of four words, and the fact a reader acts on
sits next to it.

The reference verifier `spec/verify.py` uses this order: it prints `UNSEALED` where no
signature is present, then tests `intact`, then `valid`, then coverage, and reaches
`UNRECOGNISED` only after all three hold, printing it for a revoked certificate as well as
for a chain outside the pinned root. Vector 002 exercises the
ordering directly, because pyHanko reports it as not intact **and** not trusted, and rule 2
is what makes the verdict `altered` rather than `unrecognised`. No vector combines partial
coverage with an untrusted chain, so that particular pairing is untestable here, and an
implementation that orders it the other way still passes.

### 1.3 The three rules that carry the suite

**Authenticity is a conjunction of four.** `authentic` requires `intact`, `valid`, `trusted`
and `entire_file` together, which is SPEC.md §8.1 read through §8.4. Rendering a pass from a
subset, `sealed` and `intact` alone being the common one, is the failure mode SPEC.md §8.4
and CONFORMANCE.md C-8 exist to prevent, and vector 003 is the one that catches it.

**Time is a separate axis.** `anchorState` never contributes to `authentic`. The anchor is
independent evidence of *when*, it fixes the moment certificate validity is judged at (§1.4),
and it decides how far a time-bounded revocation reaches (vectors 010 and 011). A verifier
keeps the two axes apart in both its logic and its display.

**Revocation is a third axis.** `revocationState` is reported beside the verdict rather than
folded into it, so a listed certificate whose revocation leaves this seal standing reports
`authentic` with the listing visible (vector 010), and a verifier that could not reach the
list reports `unchecked` rather than staying silent. Where a revocation does reach the seal
it withdraws trust, and the verdict that follows is `unrecognised` (§1.2).

### 1.4 Evaluation time

Certificate validity and time-bounded revocation are evaluated at a moment, and SPEC.md §8.3
step 3 fixes which: where a **confirmed** anchor is present the moment is the anchored time,
and otherwise it is the time of verification, with the verifier saying which of the two it
used. The manifest names the moment per vector:

- `evaluateAt: "now"` (default, and the reading for a vector with no confirmed anchor): the
  harness's wall clock.
- `evaluateAt: "anchorTime"`: the block time proven by the confirmed anchor the vector ships.
  Every vector shipping a confirmed `.ots` carries this, because §8.3 step 3 leaves a
  conforming verifier no other reading.

A vector whose answer differs between the two carries a second expectation block,
`expectAtVerificationTime`, which a harness asserts when it cannot reach the ledger and so
falls back to its wall clock with the anchor reported as `unverified`. Vector 014 is the
worked case. `spec/verify.py` takes the anchored time by itself when the anchor confirms, and
`--attime` supplies a moment by hand.

An offline harness reads `sealedBefore` (a Unix timestamp) from the manifest rather than
re-deriving it from the ledger.

---

## 2. What the suite ships

```
spec/vectors/
  DESIGN.md                     this document
  README.md                     how to run the suite, in three commands
  manifest.json                 the machine-readable index (§4)
  manifest.schema.json          JSON Schema for manifest.json (§4.1)
  revocations.json              one revocation list, shared by 009 to 011 (§3)
  SHA256SUMS                    digest of every shipped file, so tampering shows
  roots/
    seal-test-root.pem          the pinned root for the suite
    seal-test-intermediate.pem  the issuing intermediate
    foreign-test-root.pem       a second, unrelated root (vectors 003, 017, 020 and 024)
    foreign-test-intermediate.pem
    PINS.txt                    SHA-256 fingerprint of each of the four certificates
  generate/                     the generator, source only, reads a CA path from the environment
  NNN-<slug>/                   one directory per vector
    <artifact>                  the sealed file
    <artifact>.sig              detached seals only
    <artifact>.ots              anchor vectors only
    signer.pem                  the signing leaf, for inspection
    notes.md                    what this vector teaches, in prose
```

### 2.1 Certificates and signed artifacts only

**The suite ships PEM certificates and signed artifacts.** Key material stays outside the
published tree, and three mechanisms hold it there.

**In force today: `.gitignore`.** Line 59 excludes `spec/vectors/.keys/`, the directory the
generator mints its CA into, and the generator writes a `*` `.gitignore` inside that
directory as well, so the keys are untracked twice over.

**At publication: the mirror scripts.** Each carries one rule, and each refuses to publish
rather than failing a push, because both are invoked by hand.

- `scripts/mirror/sync-public-mirror.local.sh` walks every commit in history and refuses on
  a tracked path matching `.env`, `*.p12`, `*.key`, `*.sqlite`, `*.db` or `ca/out/`, and on
  file content matching `BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY`.
- `scripts/mirror/split-adopter-repos.local.sh` scans the built tree rather than history, for
  the same file names without the `ca/out/` term, and for the same content pattern. It is a
  dry run: it prints `READY (dry-run). Nothing pushed.` and leaves the push to a human.
- The content grep in both drops lines matching `example|placeholder|redacted|YOUR_|<`, so a
  key inside a file that also carries the word "example" reads as documentation and passes.
  The file-name rule is what catches a real key, which is why the naming rules below matter.

So:

- Ship chains as `.pem`. PKCS#12 bundles are rejected by extension whether or not they hold
  a key.
- The generator mints and keeps its CA outside the published tree. `spec/vectors/.keys/` is
  where it goes today; `$SEAL_VECTOR_CA_DIR` overrides the location once §6 wires it up,
  defaulting to `${XDG_STATE_HOME:-$HOME/.local/state}/seal-vector-ca`. Keys are created
  there, used there, and stay there.
- The generator writes only certificates, signed artifacts, `.ots` proofs, JSON, and prose
  into `spec/vectors/`.

**Wanted in CI.** `.github/workflows/ci.yml` runs `spec/vectors/run.py` over this tree and
nothing else: there is no `SHA256SUMS` verification and no key-pattern scan. A job that does
both is the third mechanism, and §7 lists it as work still to do.

### 2.2 A dedicated test CA, pinned the same way as the real one

The generator mints its own hierarchy with `openssl` directly, which is what
`spec/vectors/generate.py` already does through its `self_signed_root` and `leaf` helpers.
`ca/setup-ca.sh` is the production CA and stays that: it hardcodes its output to `ca/out`,
refuses to run once a root exists there, requires `LETSSEAL_P12_PASS`, and issues one leaf
profile. The suite needs a second unrelated root, an expired leaf, a chosen subject DN and
arbitrary SANs, so it mints them itself.

The published fixtures carry these subjects:

```
CN=SEAL Vectors Root CA, O=SEAL Conformance Vectors, C=GB      the pinned root
CN=Unrelated Root CA, O=SEAL Conformance Vectors, C=GB         the foreign root
CN=Vector Issuer Ltd, O=SEAL Conformance Vectors, C=GB         the 001 to 006 leaf
CN=Outsider Ltd, O=SEAL Conformance Vectors, C=GB              the 003 leaf
```

Both roots sign their leaves directly today. The intermediate of §2's target layout arrives
with the appended vectors, alongside a leaf profile that carries SANs.

Reasons for a separate root: the suite needs revoked certificates, an expired certificate,
and a foreign chain, and all three belong away from production trust. The harness pins the
test root by SHA-256 fingerprint from `roots/PINS.txt`, which is the same pinning path
SPEC.md §2 requires for the published root, so the code under test is the production code
path with one constant swapped.

The fixture leaves claim no letsseal.org namespace. Where a vector needs a SAN it uses the
reserved `seal-vectors.example` domain (`dNSName:seal-vectors.example`,
`URI:https://seal-vectors.example/o/seal-test`), because a throwaway CA anyone can
regenerate has no business asserting the real organisation namespace of SPEC.md §2 on a
certificate published to the world.

The **foreign** CA is complete, well-formed and self-consistent, so a signature under it is
cryptographically perfect and terminates at a root the verifier has never heard of. Vector
003 is that case. Vector 024 sharpens it: its foreign leaf carries the **same subject DN and
the same `dNSName` SAN** as the trusted leaf in 023, so only the chain differs, and an
implementation that decides trust from subject strings fails it loudly.

### 2.3 Immutability

A published vector's **id and expectation** are frozen: an implementation calibrated against
`003-pades-untrusted-root` must find the same case under the same name reporting the same
verdict, and corrections are appended as a new id at the end of the numbering rather than
folded into an existing one. Test suites that mutate under implementers are worse than no
suite.

Its **bytes** are a weaker promise, and the honest version is worth stating rather than
implying. PAdES output varies on every run from the certificate serial and the ECDSA nonce,
so the digests are not reproducible by construction and a regeneration moves them. What
survives a regeneration is the trust anchor: `generate.py` reuses the suite CA whenever its
key is present in `.keys/`, so `root.crt` and the fingerprint an implementer pinned stay put.
Treat that key as part of the suite. A regeneration without it produces a new anchor, and
every verifier pinning the old one has to re-pin.

That is why the fingerprint is what documentation quotes and the digests are not. A vector's
digest is recorded in `manifest.json` for the run that produced it, and nowhere else.

`spec/vectors/README.md` documents regenerating the whole suite with a fresh CA, and
`generate.py` removes every `0*-*` directory before it writes. That is the build-time path:
it is how the suite was produced before first publication and how an appended vector is
minted. A published directory is frozen from then on, so `generate.py` grows a mode that
writes only the ids named on its command line and leaves the rest alone, and the README
instruction gains that qualification. Adding `signer.pem` and `notes.md` beside an already
published artifact is compatible with the freeze: the artifact bytes, the id and the
expectation are untouched.

### 2.4 The vectors already published

Fifteen vectors are published, run by `spec/vectors/run.py`, and asserted in CI by
`.github/workflows/ci.yml`. They are retained under their published ids and required
verdicts, and §3 describes them under those ids:

| id | subject | this design's stanza |
|---|---|---|
| `001-pades-valid` | `document.pdf` | 001 |
| `002-pades-altered` | `document.pdf` | 002 |
| `003-pades-untrusted-root` | `document.pdf` | 003 |
| `004-pades-incremental-update` | `document.pdf` | 004 |
| `005-detached-valid` | `artifact.bin`, `artifact.bin.sig` | 005 |
| `006-detached-altered` | `artifact.bin`, `artifact.bin.sig` | 006 |
| `007-unsealed` | `document.pdf` | 012 |
| `008-revoked-key-compromise` | `document.pdf`, `revocations.json` | 009 |
| `009-revoked-orderly-seal-earlier` | `document.pdf`, `revocations.json` | 010 |
| `010-revoked-orderly-seal-later` | `document.pdf`, `revocations.json` | new |
| `011-revoked-orderly-no-proven-time` | `document.pdf`, `revocations.json` | 011 |
| `012-revoked-unknown-reason` | `document.pdf`, `revocations.json` | new |
| `013-revoked-intermediate` | `document.pdf`, `revocations.json` | new |
| `014-revocation-unreachable` | `document.pdf` | new |
| `015-revocation-clear` | `document.pdf`, `revocations.json` | new |

Where an earlier draft of this design gave a published vector a different slug or a
different subject file, the published form wins, because renaming a published vector is
exactly what §2.3 forbids. Two cases the design wanted and the published fixtures do not
carry, a leaf with a `dNSName` SAN and a foreign leaf sharing the trusted leaf's subject DN,
are appended as vectors 023 and 024 rather than folded into 001 and 003.

**The published numbering has overtaken this design's**, which planned 007 and 008 for
anchor vectors and 009 to 011 for revocation. The stanza column above is the map. Ids yet to
be published are appended above 015 rather than taking the numbers this document still uses
for them, and the stanzas below keep their own numbering because §2.3 freezes published ids,
not draft ones, and renumbering them would break every review that cites one.

The revocation vectors ship. They reach around the missing anchor by carrying the proven
moment as a manifest input, `provenTime`, rather than as a proof, and both the manifest and
`README.md` say plainly that this is the one value a verifier must not accept on trust in
production, because C-42 requires it come from a confirmed anchor. That is the honest form
of the trade: the rule gets a fixture, and the fixture says out loud where its input came
from. Vector 011 is the case the concession could otherwise hide, and it is refused.

The anchor vectors stay unshipped, which `spec/vectors/README.md` states in the same terms.
A confirmed attestation names a real block, so it takes ledger time to produce and cannot be
synthesised offline, and a fabricated proof in a conformance suite would undermine the one
thing the suite exists to do. They land when they can be made honestly, and until then the
suite says which sections of SPEC.md it covers: §2, §8.3 step 5 and §8.4.

Three things change in the tree when this design lands, and each lands with the edits that
keep the suite running:

- **`manifest.json` shape.** The published manifest keys each vector as `require` (what a
  conforming verifier MUST report) plus `observed` (what the reference verifier reports
  today, informational), with `subject`, `files` and a `freeFields` note. §4 carries the same
  split as `expect` plus `softFields`. Landing §4 therefore lands together with
  `spec/vectors/run.py`, which reads `vec["require"]`, `vec["subject"]` and `vec["files"]`,
  and with the CI step that runs it. Until then the published shape stands, and the schema in
  §4.1 rejects it, by design: they are two versions of one file rather than two files.
- **Certificate paths.** `root.crt` and `other-root.crt` sit at the root of
  `spec/vectors/` today. `run.py` pins `root.crt` by path and `README.md` names both, so the
  move to `roots/*.pem` in §2's layout lands with those two edits in the same change.
- **Per-vector files.** The published directories hold their artifacts alone. `signer.pem`
  and `notes.md` are added beside them, which §2.3 allows.

---

## 3. The vectors

### Base material

- **`document.pdf`**: a one page PDF written by `generate.py` through `fpdf` with
  compression switched off, carrying the title `SEAL Conformance Vector` and the body line
  `Conformance vector for the SEAL standard.` Uncompressed so that vector 002's byte flip is
  legible to a human reading a hex dump, which is what makes the vector teach rather than
  merely fail.
- **`artifact.bin`**: the detached subject, a single ASCII line ending in **LF**. The
  trailing newline is load bearing: see vector 005.
- **PAdES sealing**: `pyhanko` `PdfSigner` with `subfilter=PADES`, invisible signature
  field, `embed_validation_info=False`, `use_pades_lta=False`, and **`tsa_url=None`**.
  Matches `signing-service/seal.py`, which is the code the generator calls.
- **Detached sealing**: CMS SignedData whose `messageDigest` is the file's raw SHA-256,
  chain embedded, no encapsulated content, per `signing-service/detached.py`.

**No RFC 3161 token.** `generate.py` passes `tsa_url=None` deliberately, and the vectors
freeze that way. A best-effort TSA would make production network-dependent, make the
presence of a token vary between runs, and embed a second certificate chain (the default TSA
is `timestamp.digicert.com`) that terminates outside the pinned test root, which cuts across
vector 014's closed validity window. PAdES B-T therefore has its own extended vector when it
arrives, carrying the TSA root in `trustAnchors` and stating how a harness treats an
untrusted timestamp chain; §7 records it as work still to do.

Every seal is made with the test CA unless a vector says otherwise.

---

### Core tier

#### 001-pades-valid

The reference positive. Everything else is measured against this one.

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** seal `document.pdf` with a `document`-profile leaf issued directly by the
suite root, subject `CN=Vector Issuer Ltd, O=SEAL Conformance Vectors, C=GB`.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "absent", "reason": null, "issuerVerified": false, "revocation": null }
```

`issuerVerified` is false because the published leaf carries no `dNSName` SAN, so its issuer
name is self-asserted in the sense of SPEC.md §2 while every authenticity term holds. Vector
023 is the SAN-bearing positive.

**Teaches:** the happy path end to end: locating the embedded PAdES signature, building the
path to a pinned root supplied out of band, and reading coverage as the whole file.
**Catches:** a verifier that cannot find an invisible signature field at all, and one that
reports `coverage` from the `/ByteRange` array without confirming the array reaches the end
of the file.

---

#### 002-pades-altered

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** take the 001 output and flip exactly one byte inside the page content
stream. The flipped offset lies **inside** the signed `/ByteRange` and **outside** the
`/Contents` hole. Record the offset and both byte values in `notes.md`. Change a visible
character so a reader can see the difference in a viewer: the published fixture lowercases
the `C` of `Conformance vector for the SEAL standard`.

```json
{ "sealed": true, "intact": false, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "altered",
  "anchorState": "absent", "reason": "content_modified", "revocation": null }
```

`softFields: ["valid", "trusted"]`. This is the vector where the two readings of §1's field
table part company, and the harness reports the difference rather than failing on it.

The block above is pyHanko's reading, which the reference verifier reports: `valid` is
computed over the signed attributes and still verifies, `intact` is computed over the
covered content and does not, and pyHanko declines to call an unintact signature trusted, so
`trusted` comes back false. An implementation built on a single chain-checking call reads the
same file the other way round, as `valid: false` with `trusted: true`, because the content
digest mismatch fails the call before path validation is reached. Both readings are honest
about the same file, and both reach `intact: false`, `authentic: false` and
`verdict: altered`, which is what the vector requires.

Keeping integrity and trust apart is what makes a verifier's error message useful, and it is
worth the field-level divergence: writing these vectors caught the reference verifier reading
only `valid` and never `intact`, which reported an altered document as an issuer problem and
sent the reader after the wrong thing entirely.

**Teaches:** hashing exactly the byte ranges the signature names.
**Catches:** a verifier that hashes the whole file including the `/Contents` hole (which
fails every valid seal too, so it shows up at 001), and one that hashes a re-serialised
parse of the PDF rather than the original bytes, which quietly corrects the flip.

---

#### 003-pades-untrusted-root

**The most important vector in the suite.** An implementation that reports this one as
authentic is dangerously wrong, and would accept a forgery from anyone with a self signed
CA and ten minutes.

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** stand up the foreign CA and issue a leaf under it, subject
`CN=Outsider Ltd, O=SEAL Conformance Vectors, C=GB`. Seal a fresh copy of `document.pdf`
with it. The result is a cryptographically perfect PAdES signature that chains to a root the
verifier has never heard of.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "absent", "reason": "untrusted_root", "issuerVerified": false,
  "revocation": null }
```

**Teaches:** SPEC.md §8.1 and §8.4. Validity and trust are separate facts, and authenticity
is the conjunction of all four.
**Catches:** three real bugs, each of which ships in the wild.
1. Reporting a pass from `valid` alone, which is what most naive PAdES wrappers return.
2. Trusting the certificates found **inside** the signature as if they were anchors,
   because every CMS carries its own chain and a validator handed that chain as its trust
   store will happily validate anything.
3. Deciding trust from the subject `CN` or `O` string. This leaf shares the `O` and `C` of
   the 001 leaf and differs in `CN`; vector 024 closes the gap with a foreign leaf carrying
   the trusted leaf's subject DN and SAN in full.

`issuerVerified` is false here. The leaf carries no `dNSName` SAN, and an untrusted chain
would authenticate nothing anyway, SAN included, which is what 024 demonstrates.

---

#### 004-pades-incremental-update

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** take the 001 output and append a well formed incremental update: a new
object, a new cross reference section, and a trailer whose `/Prev` points at the original
cross reference offset. The published fixture adds one key to the document catalogue through
`pyhanko`'s `IncrementalPdfFileWriter`, which is enough; a text annotation on page 1 does the
same job. The appended revision must be well formed and the file must still open cleanly in a
reader, because a corrupt append tests a parser rather than coverage.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_revision", "authentic": false, "verdict": "altered",
  "anchorState": "absent", "reason": "coverage_partial", "revocation": null }
```

**Teaches:** the rule in SPEC.md §2, which §8.2 states as the PDF row of the coverage
table, that a PDF signature covering part of a file is reported as altered. Every other
field here is green. Coverage alone decides, and it decides through the `entire_file` fact
of §8.1 and row 2 of the §8.4 precedence.
**Catches:** the highest value PDF specific bug there is. Content added after signing is
how a signed PDF gets weaponised in practice, and a verifier that reports "signature valid"
because the signature genuinely is valid over the first revision has told the user the
opposite of the truth. `pyhanko` reports this as `ENTIRE_REVISION`, its name for a signature
that covers the whole of the revision it sits in while later revisions were appended; a
hand-rolled verifier reads the same fact by checking that `/ByteRange[2] + /ByteRange[3]`
equals the file length.

---

#### 005-detached-valid

**Files:** `artifact.bin`, `artifact.bin.sig`, `signer.pem`, `notes.md`

**Production:** produce a detached CMS SignedData whose `messageDigest` is
`sha256(artifact.bin)`, with the chain embedded and no encapsulated content, and write the
DER to `artifact.bin.sig`. The signer is handed the digest and the file is never handed to
the CMS layer, which is what `signing-service/detached.py` does and what makes
`-content artifact.bin` verify against it.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "absent", "reason": null, "issuerVerified": false, "revocation": null }
```

For a detached seal, `coverage` is `entire_file` by construction: the signature commits to
the digest of the whole file, which is the detached row of SPEC.md §8.2, where completeness
follows from `intact`. Byte level disagreement surfaces in `intact`.

**Teaches:** the sidecar form, and the stock command in SPEC.md §2:

```
openssl cms -verify -inform DER -in artifact.bin.sig -content artifact.bin -binary -CAfile roots/seal-test-root.pem
```

**Catches:** the `-binary` bug, which is why `artifact.bin` ends in an LF newline. Without
`-binary`, `openssl cms` applies S/MIME text canonicalisation (LF becomes CRLF) before
hashing, so every file containing a newline fails verification for a reason that has nothing
to do with the seal. An implementer who omits it fails this vector immediately and learns the
rule once, rather than shipping a verifier that rejects honest documents.

---

#### 006-detached-altered

**Files:** `artifact.bin`, `artifact.bin.sig`, `signer.pem`, `notes.md`

**Production:** copy 005 and flip one byte inside `artifact.bin`, leaving the signature file
untouched. The published fixture uppercases the leading `a` of `artifact bytes`.

```json
{ "sealed": true, "intact": false, "valid": false, "trusted": true,
  "coverage": "entire_file", "authentic": false, "verdict": "altered",
  "anchorState": "absent", "reason": "content_modified", "revocation": null }
```

`softFields: ["valid", "trusted", "coverage"]`. This is where the two seal forms genuinely
part company, and the suite constrains only what both can answer.

For an embedded PAdES seal the library checks the message digest and the signature
separately, so an altered document reports `intact` false while `valid` stays true, which
is what vector 002 records. A detached CAdES/CMS seal is checked in one step: a single
`openssl cms -verify` binds the signature to the content it is handed, so a changed byte
fails the command outright and the implementation has no position from which to report the
signature as valid or the chain as good. The shipped fixture reports `valid` false,
`trusted` false and `coverage` false for exactly that reason.

Neither answer is wrong, so the required expectation for this vector is `intact` false and
`authentic` false, which every conforming implementation reaches by whichever route its
tooling takes. `spec/vectors/manifest.json` records the reference verifier's answers under
`observed` so a difference is informative rather than a failure. `coverage` is soft for the same class of reason: `spec/verify.py` returns
`entire_file` as a copy of `valid` on the detached path, so it reports coverage as short of
the whole file here while this design reads a detached signature as covering the whole file
by construction. Both readings reach `intact: false` and `verdict: altered`, so the harness
reports the field differences and passes the vector. SPEC.md §8.2 settles the reading:
completeness follows from `intact` on the detached path. §7 item 4 carries the fix to the
reference verifier that brings it into line.

**Teaches:** a detached seal is a promise about specific bytes, and the file it names is the
one that must be hashed.
**Catches:** a verifier that reports on the signature file in isolation without ever
reading the content it covers, which passes 005 and 006 identically.

---

#### 007-anchor-pending

**Files:** `document.pdf`, `document.pdf.ots`, `signer.pem`, `notes.md`

**Production:** seal a fresh `document.pdf` as in 001, then build an `.ots` that commits to
the artifact's real SHA-256 and carries **only** calendar `PendingAttestation` entries, with
the calendar URI set to a host under the reserved `.invalid` TLD.

**Building the proof.** The stock `ots stamp` client submits to the real calendars and
writes their real URIs, so the proof is serialised directly against the OpenTimestamps
format instead, with `python-opentimestamps` (already a dependency of the signing service):

```python
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.op import OpSHA256
from opentimestamps.core.notary import PendingAttestation
from opentimestamps.core.serialize import BytesSerializationContext

with open("document.pdf", "rb") as fd:
    dtf = DetachedTimestampFile.from_fd(OpSHA256(), fd)
dtf.timestamp.attestations.add(PendingAttestation("https://calendar.seal-vectors.invalid/"))
ctx = BytesSerializationContext()
dtf.serialize(ctx)
open("document.pdf.ots", "wb").write(ctx.getbytes())
```

`PendingAttestation.ALLOWED_URI_CHARS` excludes query and fragment characters, so the URI
stays a bare host and path.

The reserved host matters. A pending proof made against a live calendar becomes confirmable
within hours by anyone running `ots upgrade`, at which point the vector silently starts
testing the opposite state. Pointing the pending attestation at a host that can never
resolve freezes the vector in the state it was built to test, and keeps the whole suite
runnable offline. The commitment is still to the artifact's genuine digest, so the "this
proof is about this file" check passes and the missing ledger attestation is the only
variable.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "pending", "reason": null, "revocation": null }
```

**Freeze condition.** The generator runs `ots verify` over the finished proof with the
network unavailable and confirms it reports pending before the vector is frozen. A client
that treats an unresolvable calendar host as an error rather than as a pending state lands
on `unverified` instead: `spec/verify.py` maps anything neither success-like nor
pending-like to `unverified`, which is what SPEC.md §3.1 requires of a tool failure, since
`pending` asserts that a calendar accepted the digest. Where the condition cannot be met,
the vector ships
`softFields: ["anchorState"]` and its `notes.md` records both readings, since the point of
the vector is that authenticity holds while time is unproven, and that holds under either
one.

**What a verifier may conclude:** that the artifact is authentic, and **nothing about time**.
A calendar's receipt is a promise to anchor. Until the attestation lands on the ledger, no
time claim is supported, and no time claim is displayed.

**Teaches:** the anchor is a second, independent axis, and its absence leaves authenticity
untouched.
**Catches:** the two symmetrical display bugs. Treating a calendar receipt as proof of time
("anchored to Bitcoin" beside a pending proof) is the dangerous one. Failing the whole
document because the anchor has not confirmed is the annoying one, and it is what makes
users distrust a verifier that is working correctly.

---

#### 008-anchor-confirmed

**Files:** `document.pdf`, `document.pdf.ots`, `signer.pem`, `notes.md`

**Production:** seal a fresh `document.pdf`, submit its digest to the public
OpenTimestamps calendars, wait for the Bitcoin transaction to confirm (a few hours), run
`ots upgrade`, and freeze the upgraded `.ots`. This is the one vector that cannot be
synthesised: a real attestation names a real block, and the generator has to wait for it.
Record the block height and the block's Unix time in the manifest as `anchorBlock` and
`sealedBefore`.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "confirmed", "reason": null, "revocation": null,
  "anchorBlock": 912345 }
```

(`anchorBlock` above is illustrative; the generator writes the real height.)

`requiresNetwork: true`. Confirming an attestation means reading a block header from a node
or an explorer. When the harness has neither, it reports SKIP for `anchorState` and asserts
every other field.

**What a verifier may conclude:** that this exact file existed by that block's time, and
that the conclusion holds for a relying party who trusts nobody named in the proof. This is
what makes the time claim survive the issuer, the TSA, and Let's Seal.

**Teaches:** verify the attestation, read the block, and bind the answer to the digest of
the file in hand.
**Catches:** accepting an `.ots` without checking which digest it commits to (see vector
015), and reporting the calendar's submission time rather than the block's time as the
proven moment.

---

#### The shared revocation list

Vectors 009 to 011 read one file, `revocations.json`, in the shape
`signing-service/revocation.py` reads and `ca/setup-ca.sh revoke` writes. Consulting it is a
MUST for a verifier that can reach it (SPEC.md §8.3 step 5), and the three vectors are the
fixtures for the reason semantics that step carries:

```json
{
  "version": 1,
  "updated_at": "2026-09-01T00:00:00Z",
  "revoked": [
    { "serial": "4b1d8f0c73a2e5619d40",
      "subject": "CN=Vector Revoked Leaf 009, O=SEAL Conformance Vectors, C=GB",
      "reason": "key_compromise",
      "revoked_at": "2026-09-01T00:00:00Z",
      "note": "conformance vector 009" }
  ]
}
```

- Entries are keyed by **certificate serial**, lowercase hex with leading zeros stripped,
  which is `revocation.py`'s `_normalise_serial`. Each of 009, 010 and 011 carries its leaf's
  serial in the manifest as `signerSerial` and repeats it in `notes.md`, so a harness joins a
  vector to its entry without parsing the certificate.
- Vectors 010 and 011 share one leaf, so they share one serial and one entry. That is what
  makes the anchor the only variable between them.
- The generator writes `revoked_at` directly. `ca/setup-ca.sh revoke` stamps it from `date -u`
  at the moment of revocation, and these vectors need a date strictly after a block time that
  is already in the past when the list is written.
- The list ships beside `SHA256SUMS`, which covers its digest, and that is where its
  integrity comes from here. CPS.md §4.9 describes the production list as carrying a
  signature by the log key; the code that writes the list stops at the JSON, so §7 item 9
  records the gap and the harness contract asks for a digest match rather than a signature.

---

#### 009-revoked-key-compromise

**Files:** `document.pdf`, `document.pdf.ots` (confirmed), `signer.pem`, `notes.md`, plus
the shared `revocations.json`

**Production:** issue a dedicated leaf, seal `document.pdf` with it, anchor it and wait for
confirmation as in 008. Then list that leaf in `revocations.json`, keyed by its serial, with
`reason: "key_compromise"` and a `revoked_at` strictly **after** the anchor's block time.

The confirmed anchor is deliberate. It proves the seal predates the revocation, and the
verdict is unchanged anyway. That is the whole lesson.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "confirmed", "revocationState": "revoked",
  "reason": "certificate_revoked", "issuerVerified": false,
  "revocation": { "listed": true, "reason": "key_compromise",
                  "effect": "unconditional", "appliesToThisSeal": true } }
```

The verdict is `unrecognised` because the revocation withdraws trust and SPEC.md §8.4 gives
four verdicts, of which that is the one the failing `trusted` fact reaches (§1.2). What
makes the report readable is the pair beside it: `revocationState: "revoked"` and the
`revocation` object naming the reason. A verifier saying "unrecognised, certificate revoked
for key compromise" has told the reader both the decision and the cause.

**Teaches:** SPEC.md §8.3 step 5 and CPS.md §4.9. A compromised key was in another party's
hands from a moment nobody can establish, so every seal under it falls, whatever its date
and however good its evidence of time.
**Catches:** an implementation that applies the time-bounded rule to every reason code,
which is the natural thing to write once you have built the machinery for vector 010, and
which keeps trusting seals made with a stolen key. `ca_compromise` behaves identically, and
an unrecognised reason string is handled as `key_compromise`, because the safe direction for
a trust decision is the strict one.

---

#### 010-revoked-superseded

**Files:** `document.pdf`, `document.pdf.ots` (confirmed), `signer.pem`, `notes.md`, plus
the shared `revocations.json`

**Production:** issue a second dedicated leaf, seal, anchor, wait for confirmation. List it
in `revocations.json`, keyed by its serial, with `reason: "superseded"` and a `revoked_at`
strictly **after** the anchor's block time. Vectors 010 and 011 share this leaf and its entry,
so the only variable between them is whether an anchor accompanies the artifact.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "confirmed", "revocationState": "checked-clear",
  "reason": null, "issuerVerified": true,
  "revocation": { "listed": true, "reason": "superseded",
                  "effect": "time_bounded", "appliesToThisSeal": false } }
```

`sealedBefore` is set to the block's Unix time so an offline harness can inject the proven
moment without reaching the ledger.

**Teaches:** the reason code decides reach, and a confirmed anchor is the independent
evidence that lets an orderly retirement leave honest evidence standing. A key retired in
good order withdraws nothing that was properly sealed before the retirement.
**Catches:** the destructive bug. A verifier that treats any listed certificate as
untrusted invalidates years of legitimate documents the moment an organisation rotates a
key on schedule, and it does so silently. Note also that `revocation.listed` is true here
while `authentic` is true: the report says the certificate was superseded **and** that this
seal stands, which is the honest presentation, and it is sayable because SPEC.md §8.4 keeps
the revocation state beside the verdict rather than inside it.

---

#### 011-revoked-superseded-unanchored

**Files:** `document.pdf`, `signer.pem`, `notes.md`, plus the shared `revocations.json`

**Production:** seal a second copy of `document.pdf` with the **same leaf as 010** and ship
no `.ots`. Same certificate, same revocation entry, no proof of when.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "absent", "revocationState": "revoked",
  "reason": "certificate_revoked", "issuerVerified": false,
  "revocation": { "listed": true, "reason": "superseded",
                  "effect": "time_bounded", "appliesToThisSeal": true } }
```

**Teaches:** the time-bounded rule is conditional on evidence, and the evidence has to be
independent. Without a confirmed anchor there is nothing that places the seal before the
revocation, so the revocation counts against it.
**Catches:** an implementation that takes the sealing time from the signature's own
`signingTime` attribute, or from the TSA token, or from a database row, and concludes the
seal predates the revocation. Each of those is asserted by a party with an interest in the
answer. Compared side by side with 010 this vector states the rule in one line: the anchor
is what earns the benefit of the doubt.

---

### Extended tier

#### 012-pades-unsealed

**Files:** `document.pdf`, `notes.md`

Plain `document.pdf`, never signed, and so with no `signer.pem` to ship.

```json
{ "sealed": false, "intact": false, "valid": false, "trusted": false,
  "coverage": "none", "authentic": false, "verdict": "unsealed",
  "anchorState": "absent", "reason": "no_seal", "revocation": null }
```

**Teaches:** `unsealed` is the first row of the SPEC.md §8.4 precedence and the word for a
file that makes no claim. The reference verifier prints it as `UNSEALED`.
**Catches:** a verifier that crashes, or that returns an empty success, when handed an
ordinary PDF. The distinction between "this file makes no claim" and "this file's claim
fails" belongs in the report, because they call for different words to a user.

---

#### 013-pades-signature-forged

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** take 001, re-sign the identical `signedAttrs` with a **different** EC key,
and splice the resulting CMS into the existing `/Contents` hole, zero padded to the same
length so `/ByteRange` is unchanged. The signer certificate in the CMS remains the genuine
001 leaf, so the certificate's public key does not match the signature value. The
`messageDigest` attribute still matches the document, so the content check passes.

```json
{ "sealed": true, "intact": true, "valid": false, "trusted": true,
  "coverage": "entire_file", "authentic": false, "verdict": "altered",
  "anchorState": "absent", "reason": "signature_invalid", "revocation": null }
```

**Catches:** the verifier that compares the `messageDigest` signed attribute against the
document hash, sees a match, and calls it valid without ever running the ECDSA
verification. It passes 001 and 002 and fails only here.

---

#### 014-cert-expired

**Files:** `document.pdf`, `document.pdf.ots` (confirmed), `signer.pem`, `notes.md`

**Production:** issue a leaf with a short validity window that has since closed. Seal while
it was valid, anchor, wait for confirmation, and freeze.

The vector carries `evaluateAt: "anchorTime"`, because SPEC.md §8.3 step 3 leaves a verifier
that confirms this anchor no other reading: where a confirmed anchor is present, certificate
validity is judged at the anchored time.

`expect`, at the anchored time, which is the required reading:

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "confirmed", "reason": null, "revocation": null }
```

`expectAtVerificationTime`, asserted by a harness that cannot reach the ledger, so the anchor
stays `unverified` and the wall clock is the only moment on offer:

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "unverified", "reason": "certificate_expired", "revocation": null }
```

**Teaches:** the moment is what the anchor buys, and the verifier states which moment it
evaluated at. `spec/verify.py` prints exactly that line, taking the anchored time by itself
once the anchor confirms. Judged against the clock on the day of reading, a seal expires with
its certificate, so a five-year certificate would carry a five-year evidence horizon.
**Catches:** the blanket time bypass, and its mirror image. A verifier that disables validity
checking to stop old documents failing then accepts a leaked leaf forever, and a verifier
that judges every seal against wall-clock time while a confirmed anchor sits in front of it
reports every properly sealed five year old document as untrustworthy.

---

#### 015-anchor-digest-mismatch

**Files:** `document.pdf`, `document.pdf.ots`, `signer.pem`, `notes.md`

**Production:** ship the 001 artifact together with the `.ots` from vector 008, which
commits to a different file's digest.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "unverified", "reason": null, "revocation": null }
```

`unverified` is the state of SPEC.md §3.1 that fits: the verifier holds a proof and is unable
to check it against the artifact in hand, and it asserts nothing further. Reporting
`confirmed` here would carry a real ledger attestation across to a file it says nothing
about, and reporting `pending` would manufacture a calendar's promise this artifact never
received. The vector's `notes.md` and the verifier's own message carry the digest mismatch as
the cause; §7 item 5 records that a state named for it is worth asking SPEC.md §3.1 for.

**Teaches:** the anchor is bound to a digest, and a proof about a different file supports no
claim about this one. Authenticity is untouched, and the report shows no time.
**Catches:** running `ots verify` and reading only its exit status, or reading a `.ots` as
"an anchor is present" without comparing its committed digest against the file in hand.
This is how a real proof gets attached to the wrong document and displayed as evidence.

---

#### 016-c2pa-image-valid

**Files:** `image.jpg`, `signer.pem`, `notes.md`

A JPEG carrying a C2PA manifest signed by a `document`-profile leaf (which satisfies the
C2PA certificate profile, C2PA 2.x §14.5.1), with the test root configured as a C2PA trust
anchor. The vector carries `sealType: "c2pa"`, and its `expect` block mirrors 001 with
coverage `entire_file` read as SPEC.md §8.2 defines it for this form: the manifest's hard
binding covers the asset, with the manifest store excluded.

**Catches:** configuring a C2PA library's default trust list instead of the pinned root,
which makes a manifest that merely validates read as trusted.

---

#### 017-c2pa-image-foreign-root

**Files:** `image.jpg`, `signer.pem`, `notes.md`

The same image sealed by the foreign CA. The vector carries `sealType: "c2pa"`, and its
`expect` block mirrors 003: `valid: true, trusted: false, verdict: "unrecognised"`. A C2PA
reader reports this state as `Valid` in its own vocabulary, which is precisely the trap:
`Valid` in C2PA terms is the `valid` field here, and it is one term of four.

---

#### 018-xmldsig-valid

**Files:** `signed.xml`, `signer.pem`, `notes.md`

An enveloped W3C XML Signature over an XML document, chain in `KeyInfo`, enveloped
transform plus C14N. The vector carries `sealType: "xmldsig"`, and its `expect` block
mirrors 001, with coverage `entire_file` read as SPEC.md §8.2 defines it here: the signature
covers the document with the signature element itself excluded. Verifies with
`xmlsec1 --verify --trusted-pem roots/seal-test-root.pem signed.xml`.

**Catches:** verifying the signature while ignoring what the `Reference` URI and transforms
actually cover, which is the XML equivalent of vector 004.

---

#### 019-smime-valid

**Files:** `message.eml`, `signer.pem`, `notes.md`

A `multipart/signed` message (RFC 8551) with a detached CMS signature and the chain
embedded. The vector carries `sealType: "smime"`, and its `expect` block mirrors 001, with
coverage `entire_file` read as SPEC.md §8.2 defines it here: the signature covers the signed
part of the message in full. Verifies with `openssl smime -verify -in message.eml -CAfile roots/seal-test-root.pem`.

---

#### 020-cades-detached-foreign-root

**Files:** `artifact.bin`, `artifact.bin.sig`, `signer.pem`, `notes.md`

The detached twin of vector 003, and strongly recommended for any implementation that
supports the sidecar form. A fresh copy of `artifact.bin` plus an `artifact.bin.sig` from
the foreign CA, whose leaf carries the same subject DN as the 005 leaf.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "absent", "reason": "untrusted_root", "issuerVerified": false,
  "revocation": null }
```

**Catches:** the specific detached-path bug. `openssl cms -verify` needs `-noverify` for
the signature-only reading and `-CAfile` for the chain reading, and an implementation that
runs only the first reports every well formed CMS as trusted. `spec/verify.py` runs both,
and this vector is what holds that line.

---

#### 021-issuer-self-asserted

**Files:** `document.pdf`, `signer.pem`, `notes.md`

A seal from a leaf whose subject `CN` reads `CN=Bank of Somewhere`, a name it has proven no
relationship to, and whose SANs are empty.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "absent", "reason": null, "issuerVerified": false, "revocation": null }
```

**Teaches:** SPEC.md §2. Issuer identity lives in the `subjectAltName`. The subject `CN` is
a label chosen by the sealing account, and a certificate with no `dNSName` SAN denotes a
self-asserted issuer: the integrity and time claims hold, and the issuer name is a claim.
**Catches:** a user interface that prints the subject `CN` under a green tick, which turns
an authentic seal into an impersonation surface. The vector is authentic and its issuer is
unverified at the same time, which is the state a verifier has to be able to express.

---

#### 022-translog-inclusion

**Files:** `leaf.json`, `proof.json`, `sth.json`, `log-cert.pem`, `notes.md`

Transparency log material for SPEC.md §6: a leaf payload, its audit path, and a Signed Tree
Head of matching `treeSize`. Uses `expectLog` rather than `expect`.

```json
{ "inclusion": true, "index": 42, "treeSize": 128, "rootHashMatches": true,
  "sthSignatureValid": true, "sthCertTrusted": true }
```

**The wire shapes are the ones SPEC.md §6 fixes**, and the vector ships them verbatim.
`proof.json` carries `index`, `treeSize`, `leafHash`, `rootHash` and `proof`, the last an
ordered array of lowercase-hex sibling hashes; `index` and `treeSize` are REQUIRED, because
RFC 6962 audit-path arithmetic rests on them, and a suite that omitted them would let an
implementation pass by guessing the shape of the tree. `sth.json` carries `treeSize`,
`rootHash` as lowercase hex, `timestamp` as integer milliseconds, `signature` as base64 DER,
`logCert` and `logChain` as PEM, and the anchor state of the head. The signature is ECDSA on
P-256 over SHA-256 of the bytes
`letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`, so `sthSignatureValid` is checked against
the certificate carried in `logCert` and `sthCertTrusted` is that certificate path-validating
to the pinned root. `log-cert.pem` ships the same certificate on its own for inspection; the
STH stands up without it, which is what "self-contained" means in §6.

**Teaches:** the exact preimages. A leaf is

```
SHA-256(0x00 ‖ {"v":1,"sha256":"<hex>","sealType":"<type>","certCN":"<cn>","ts":<unixMs>})
```

with **that key order**, no whitespace, and the `v` field first. This is what
`web/lib/translog.ts` emits, and `web/lib/cosign-tlog.ts` records the same rule for its own
body: field order is fixed on purpose. Sorting the keys, as RFC 8785 JCS would, produces a
different leaf hash and fails every inclusion proof, so a SEAL leaf is a fixed-order
serialisation rather than a JCS one. Interior nodes are `SHA-256(0x01 ‖ left ‖ right)`, and
the STH is signed over the ASCII bytes
`letsseal.sth.v1\n<treeSize>\n<rootHex>\n<tsMs>\n`.

**Catches:** the two classic RFC 6962 errors: omitting the `0x00` and `0x01` domain
separation prefixes (which allows a leaf to be presented as an interior node), and
serialising the leaf JSON with different key order or whitespace than the running log emits.
Both produce a root hash that is wrong in a way no amount of staring reveals, so a fixed
vector is the only practical way to find them. SPEC.md §6 now writes the leaf with the `v`
field and states that the member order is the one given there rather than a sorted one, so
this vector and the specification say the same thing; §7 item 7 records that as closed. It
also catches an implementation that fetches an inclusion proof and checks it against an STH
of a different `treeSize`, which is why both numbers travel in the proof.

---

#### 023-pades-issuer-verified

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** seal a fresh `document.pdf` with a leaf issued by the test intermediate
carrying `dNSName:seal-vectors.example` and `URI:https://seal-vectors.example/o/seal-test`
as SANs.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": true,
  "coverage": "entire_file", "authentic": true, "verdict": "authentic",
  "anchorState": "absent", "reason": null, "issuerVerified": true, "revocation": null }
```

**Teaches:** authenticated issuer identity, which SPEC.md §2 places in the `subjectAltName`.
Read side by side with 021, the pair states the whole rule: same verdict, different issuer
claim.
**Catches:** a verifier that reports `issuerVerified` from the presence of a certificate
rather than from a `dNSName` SAN under a trusted chain. It passes 001 and 021 by accident
and separates only here.

---

#### 024-pades-foreign-root-same-subject

**Files:** `document.pdf`, `signer.pem`, `notes.md`

**Production:** issue a foreign-CA leaf with the **same subject DN and the same
`dNSName` SAN** as the 023 leaf, and seal a fresh copy of `document.pdf` with it. Only the
chain differs.

```json
{ "sealed": true, "intact": true, "valid": true, "trusted": false,
  "coverage": "entire_file", "authentic": false, "verdict": "unrecognised",
  "anchorState": "absent", "reason": "untrusted_root", "issuerVerified": false,
  "revocation": null }
```

**Teaches:** an untrusted chain authenticates nothing, SAN included. `issuerVerified` is
false here while the SAN is present and well formed, because it is the chain that gives the
SAN its meaning.
**Catches:** deciding trust, or issuer identity, from subject strings. A verifier that
compares this leaf against the 023 leaf field by field finds them identical everywhere the
subject is concerned, and the only thing that separates them is the root they reach.

---

## 4. `manifest.json`

One file, at `spec/vectors/manifest.json`, listing every vector with its expectation, so a
harness in any language iterates it without parsing prose.

### 4.1 Schema

Ships as `spec/vectors/manifest.schema.json`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://letsseal.org/spec/vectors/manifest.schema.json",
  "title": "SEAL test vector manifest",
  "type": "object",
  "required": ["suiteVersion", "specVersion", "generatedAt", "trustAnchors", "vectors"],
  "additionalProperties": false,
  "properties": {
    "$schema":      { "type": "string" },
    "suiteVersion": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "specVersion":  { "type": "string", "description": "SEAL version the expectations follow, e.g. 1.1" },
    "generatedAt":  { "type": "string", "format": "date-time" },
    "revocationList": { "type": "string", "description": "path to the shared revocation list" },
    "trustAnchors": {
      "type": "object",
      "required": ["pinnedRoot"],
      "additionalProperties": false,
      "properties": {
        "pinnedRoot":    { "$ref": "#/$defs/certRef" },
        "intermediates": { "type": "array", "items": { "$ref": "#/$defs/certRef" } },
        "foreignRoots":  { "type": "array", "items": { "$ref": "#/$defs/certRef" },
                           "description": "MUST NOT be placed in the harness trust set" }
      }
    },
    "vectors": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/vector" } }
  },

  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },

    "certRef": {
      "type": "object",
      "required": ["file", "sha256Fingerprint"],
      "additionalProperties": false,
      "properties": {
        "file":             { "type": "string" },
        "sha256Fingerprint":{ "$ref": "#/$defs/sha256" },
        "subject":          { "type": "string" }
      }
    },

    "expectation": {
      "type": "object",
      "required": ["sealed", "intact", "valid", "trusted", "coverage",
                   "authentic", "verdict", "anchorState", "reason"],
      "additionalProperties": false,
      "properties": {
        "sealed":   { "type": "boolean" },
        "intact":   { "type": "boolean" },
        "valid":    { "type": "boolean" },
        "trusted":  { "type": "boolean" },
        "coverage": { "enum": ["entire_file", "contiguous_block_from_start",
                               "entire_revision", "other", "none"] },
        "authentic":{ "type": "boolean" },
        "verdict":  { "enum": ["unsealed", "altered", "unrecognised", "authentic"],
                      "description": "SPEC.md 8.4, applied in that precedence" },
        "anchorState": { "enum": ["confirmed", "pending", "absent", "unverified"],
                         "description": "SPEC.md 3.1" },
        "revocationState": { "enum": ["checked-clear", "revoked", "unchecked"],
                             "description": "SPEC.md 8.3 step 5; a vector that omits it expects checked-clear from a harness that loaded the list" },
        "reason": {
          "oneOf": [
            { "type": "null" },
            { "enum": ["no_seal", "content_modified", "signature_invalid",
                       "coverage_partial", "untrusted_root", "chain_incomplete",
                       "certificate_expired", "certificate_revoked"] }
          ]
        },
        "issuerVerified": { "type": "boolean" },
        "anchorBlock":    { "type": "integer", "minimum": 1 },
        "revocation": {
          "oneOf": [
            { "type": "null" },
            {
              "type": "object",
              "required": ["listed", "reason", "effect", "appliesToThisSeal"],
              "additionalProperties": false,
              "properties": {
                "listed": { "const": true,
                            "description": "the object exists exactly when the certificate is listed, so this is always true; null carries the unlisted case" },
                "reason": { "enum": ["key_compromise", "ca_compromise", "unspecified",
                                     "superseded", "cessation_of_operation",
                                     "affiliation_changed", "privilege_withdrawn"] },
                "revokedAt": { "type": "string", "format": "date-time",
                               "description": "optional; the §3 expectations assert the reading rather than the date" },
                "effect": { "enum": ["unconditional", "time_bounded", "none"] },
                "appliesToThisSeal": { "type": "boolean" }
              }
            }
          ]
        }
      }
    },

    "logExpectation": {
      "type": "object",
      "required": ["inclusion", "index", "treeSize", "rootHashMatches",
                   "sthSignatureValid", "sthCertTrusted"],
      "additionalProperties": false,
      "properties": {
        "inclusion":         { "type": "boolean" },
        "index":             { "type": "integer", "minimum": 0,
                               "description": "leaf index; RFC 6962 audit-path arithmetic rests on it and on treeSize (SPEC.md 6)" },
        "treeSize":          { "type": "integer", "minimum": 1 },
        "rootHashMatches":   { "type": "boolean" },
        "sthSignatureValid": { "type": "boolean",
                               "description": "ECDSA P-256 over SHA-256 of the letsseal.sth.v1 bytes, DER as base64, checked against the STH's own logCert" },
        "sthCertTrusted":    { "type": "boolean",
                               "description": "the STH's logCert path-validates to the pinned root through logChain" }
      }
    },

    "vector": {
      "type": "object",
      "required": ["id", "dir", "tier", "sealType", "title", "files", "teaches", "catches"],
      "additionalProperties": false,
      "properties": {
        "id":    { "type": "string", "pattern": "^[0-9]{3}-[a-z0-9-]+$" },
        "dir":   { "type": "string", "pattern": "^[0-9]{3}-[a-z0-9-]+$" },
        "tier":  { "enum": ["core", "extended"] },
        "title": { "type": "string" },
        "sealType": { "enum": ["pades", "cades_detached", "c2pa", "xmldsig",
                               "smime", "blob", "attestation", "translog", "none"] },

        "artifact":       { "type": "string" },
        "artifactSha256": { "$ref": "#/$defs/sha256" },
        "signature":      { "type": ["string", "null"] },
        "anchor":         { "type": ["string", "null"] },
        "signerCert":     { "type": "string" },
        "signerSerial":   { "type": "string", "pattern": "^[0-9a-f]+$",
                            "description": "signing certificate serial, lowercase hex with leading zeros stripped; joins a vector to its revocations.json entry" },
        "files": {
          "type": "array", "minItems": 1,
          "items": {
            "type": "object",
            "required": ["path", "sha256"],
            "additionalProperties": false,
            "properties": {
              "path":   { "type": "string" },
              "sha256": { "$ref": "#/$defs/sha256" }
            }
          }
        },

        "evaluateAt":     { "enum": ["now", "anchorTime"], "default": "now",
                            "description": "anchorTime wherever the vector ships a confirmed anchor, since SPEC.md 8.3 step 3 makes the anchored time the moment validity is judged" },
        "sealedBefore":   { "type": ["integer", "null"],
                            "description": "Unix seconds proven by a confirmed anchor" },
        "requiresNetwork":{ "type": "boolean", "default": false },
        "requiresTools":  { "type": "array", "items": { "type": "string" } },
        "softFields":     { "type": "array", "items": { "type": "string" },
                            "description": "reported and never failed on for this vector" },

        "expect":            { "$ref": "#/$defs/expectation" },
        "expectAtVerificationTime": { "$ref": "#/$defs/expectation",
                                      "description": "the reading for a harness that cannot reach the ledger, so the anchor is unverified and the wall clock is the only moment available (1.4)" },
        "expectLog":         { "$ref": "#/$defs/logExpectation" },

        "teaches": { "type": "string" },
        "catches": { "type": "string" }
      },
      "allOf": [
        {
          "if":   { "properties": { "sealType": { "const": "translog" } },
                    "required": ["sealType"] },
          "then": { "required": ["expectLog"] },
          "else": { "required": ["expect", "artifact", "artifactSha256"] }
        }
      ]
    }
  }
}
```

### 4.2 Worked example entry

Vector 003, complete. Digests and fingerprints below are **illustrative**; the shipped
manifest carries the real values written by the generator.

```json
{
  "id": "003-pades-untrusted-root",
  "dir": "003-pades-untrusted-root",
  "tier": "core",
  "title": "Valid PAdES signature from a certificate chaining to a different root",
  "sealType": "pades",

  "artifact": "document.pdf",
  "artifactSha256": "9f2c4b7ad3e15608c1a94f0b2d76e83a5c0148bf9e2d7a36c48b10e5fa62d379",
  "signature": null,
  "anchor": null,
  "signerCert": "signer.pem",
  "files": [
    { "path": "document.pdf",
      "sha256": "9f2c4b7ad3e15608c1a94f0b2d76e83a5c0148bf9e2d7a36c48b10e5fa62d379" },
    { "path": "signer.pem",
      "sha256": "6b0e1d84c27f395ab8d40e6127c9fa3055e8b1476d20ca93f8e5470b62d1ac88" },
    { "path": "notes.md",
      "sha256": "1c74f0a9b3d5e2861f47a0c9d68b35e047fa9c21b8d6403e75c1ab29e60f8d54" }
  ],

  "evaluateAt": "now",
  "sealedBefore": null,
  "requiresNetwork": false,
  "requiresTools": [],
  "softFields": [],

  "expect": {
    "sealed": true,
    "intact": true,
    "valid": true,
    "trusted": false,
    "coverage": "entire_file",
    "authentic": false,
    "verdict": "unrecognised",
    "anchorState": "absent",
    "reason": "untrusted_root",
    "issuerVerified": false,
    "revocation": null
  },

  "teaches": "SPEC.md section 8.1 and 8.4: intact, valid, trusted and entire_file are four independent facts, and authenticity is the conjunction of all four. The signature here is cryptographically perfect and the certificate chain is internally consistent; it simply terminates at a root the verifier was never given, so trusted fails and the verdict is unrecognised.",
  "catches": "Reporting a pass from `valid` alone; treating the certificates embedded in the CMS as trust anchors, which validates any self-issued hierarchy; and deciding trust from the subject CN or O, which vector 024 sharpens with a foreign leaf carrying the trusted leaf's subject DN and dNSName SAN in full."
}
```

And the surrounding document:

```json
{
  "$schema": "./manifest.schema.json",
  "suiteVersion": "1.0.0",
  "specVersion": "1.1",
  "generatedAt": "2026-08-01T00:00:00Z",
  "revocationList": "revocations.json",
  "trustAnchors": {
    "pinnedRoot": {
      "file": "roots/seal-test-root.pem",
      "subject": "CN=SEAL Test Root CA (test vectors only), O=SEAL Test Vectors, C=GB",
      "sha256Fingerprint": "d41f8c0b7e5a2963c8b40f17ae629d3055c1b8746e0293fa5d8c61b04e7f2a19"
    },
    "intermediates": [
      { "file": "roots/seal-test-intermediate.pem",
        "sha256Fingerprint": "7a3e91c05b8d24f6019ec7b3a5d82f4460be1c97d05a3e28f7b41c690da85e37" }
    ],
    "foreignRoots": [
      { "file": "roots/foreign-test-root.pem",
        "sha256Fingerprint": "2e60b19a4c7d3f805a1b9e26c4708df3915ba60cd82e4713f9a05c6b17e2d840" }
    ]
  },
  "vectors": [ /* 001 ... 024 */ ]
}
```

---

## 5. Harness contract

A harness in any language does this:

1. Read `manifest.json` and validate it against `manifest.schema.json`.
2. Verify `SHA256SUMS` over the tree, so a modified vector is caught before it is read as a
   verifier bug.
3. Load `trustAnchors.pinnedRoot` into the verifier's pinned set, by fingerprint;
   `spec/verify.py` takes it as `--root <pem>`, and `run.py` sets the same pin in process
   through `verify.set_pinned_root`. Load the intermediates as untrusted path material.
   **Place `foreignRoots` nowhere**: they ship so an implementer can inspect the chain, and a
   harness that trusts them turns vectors 003, 017, 020 and 024 green for the wrong reason.
4. Load `revocationList` into the verifier, keyed by certificate serial, with the reason
   semantics of SPEC.md §8.3 step 5 and CPS.md §4.9. Consulting the list is a MUST for a
   verifier that can reach it, and a verifier that cannot reach it reports `unchecked`, so a
   harness running without revocation input records `revocationState` and `revocation` as
   SKIP for vectors 009 to 011 and says so, rather than reading the silence as a pass.
5. For each vector: run the verifier over `artifact` (plus `signature` and `anchor` where
   present) at `evaluateAt`, and compare every field in `expect`.

Rules:

- A field listed in `softFields` is reported and never failed on.
- A field the verifier under test does not report (`issuerVerified`, `revocation`, `reason`)
  is recorded as not applicable, distinct from PASS and from SKIP. Conformance rests on the
  verdict vocabulary of SPEC.md §8.4, the anchor states of §3.1 and the revocation state of
  §8.3 step 5; the rest is reported so a richer implementation gets checked.
- When `requiresNetwork` is true and the ledger is unreachable, `anchorState` is `unverified`
  and every other field is still asserted, from `expectAtVerificationTime` where the vector
  carries one (§1.4) and from `expect` where it does not.
- When a tool in `requiresTools` is missing, the whole vector reports SKIP.
- SKIP is distinct from PASS in the summary output. A run where half the suite skipped and
  printed a green total is worse than no suite at all.
- Exit code 0 when every non-skipped core vector passes.

The suite ships a reference harness, `spec/vectors/run.py`, which drives `spec/verify.py`
for the fields that verifier reports: `sealed`, `intact`, `valid`, `trusted`, `entire_file`
and the `authentic` conjunction, over the six published vectors. Those expectations are
demonstrated to be reachable rather than asserted to be, and CI runs the harness on every
change.

The rest of this design outruns the reference verifier today, and the gap is a work list
rather than a claim:

- **Revocation.** `spec/verify.py` reads a list through `--revocations`, from a path or a
  URL, and applies the reason semantics of SPEC.md §8.3 step 5: a compromise reaches every
  seal, an orderly retirement leaves a seal made before the revocation date standing where a
  confirmed anchor proves the date, an unrecognised reason is handled as a compromise, and an
  unreachable list reports `unchecked`. It prints the state on its `revoked` line and the
  verdict as `UNRECOGNISED` where a revocation reaches the seal. What remains is the
  `revocation` object of §1, which it does not emit in structured form.
- **Coverage names.** It returns pyHanko's `ENTIRE_FILE`, `ENTIRE_REVISION` and
  `CONTIGUOUS_BLOCK_FROM_START`. The manifest uses the lowercase forms of §1, so the harness
  needs a mapping, or the verifier needs to emit them.
- **Structured output.** It prints a `RESULT` line carrying the §8.4 verdict in words, with
  `anchor` and `revoked` lines beside it, rather than emitting `verdict`, `reason`,
  `issuerVerified`, `anchorState` and `revocationState` as fields. The §1.1 `reason`
  vocabulary needs a machine-readable form before a harness can compare it.

§7 carries these as work items.

---

## 6. Generator

Out of scope for this document beyond its interface. `spec/vectors/generate.py` is the
generator today; the target is a package at `spec/vectors/generate/` that keeps its CA
outside the published tree and:

- mints and reads its CA at `$SEAL_VECTOR_CA_DIR`, defaulting to
  `${XDG_STATE_HOME:-$HOME/.local/state}/seal-vector-ca`, which replaces today's
  `spec/vectors/.keys/`,
- writes only the vector ids named on its command line, so a published directory stays
  frozen (§2.3),
- writes only certificates, artifacts, `.ots` proofs, JSON and prose into `spec/vectors/`,
- emits `manifest.json` and `SHA256SUMS` as its last step,
- runs the publication pipeline's key patterns (§2.1) over its own output and fails the run
  on a hit,
- and pauses for the confirmed-anchor vectors (008, 009, 010, 014), which need a real
  Bitcoin confirmation. Batch those four into one anchoring run, wait, `ots upgrade`, then
  freeze.

---

## 7. Open questions and work items

Recorded here because the suite forces each one into the open. Items 1 to 9 are questions
for SPEC.md, CPS.md and CONFORMANCE.md, and the amended SPEC.md has since answered several,
which are marked closed where it has; items 10 to 13 are work this design depends on.

1. **Entire-file coverage and legitimate incremental updates.** SPEC.md §2 requires a PDF
   signature to cover the entire file, so any post-signing incremental update makes the
   first signature partial. That correctly catches vector 004, and it also means a document
   carrying two SEAL signatures reports the first one as `entire_revision`, which is the
   state pyHanko's own documentation calls expected when a file contains multiple
   signatures, and that a B-LT style DSS addition would do the same. §2 places B-LT and
   B-LTA out of scope, which resolves the DSS case. The multiple-signature case is worth
   stating explicitly in §8.

2. **Verdict precedence.** ~~SPEC.md §8 leaves the ordering open when several terms fail at
   once.~~ **Closed.** SPEC.md §8.4 fixes the vocabulary at `unsealed`, `altered`,
   `unrecognised` and `authentic` and the precedence in which a verifier applies them. §1.2
   above restates that order rather than proposing one, and the one case the suite cannot
   test either way (partial coverage under an untrusted chain) is noted there.

3. **`unspecified` as a revocation reason.** `signing-service/revocation.py` places
   `unspecified` in the unconditional set by name, and `ca/setup-ca.sh` accepts it as an
   ordinary reason, so it is a recognised reason handled explicitly rather than one that
   falls through the "a reason a verifier does not recognise" row that SPEC.md §8.3 step 5
   now carries. CPS.md §4.9 names it in neither row. The behaviour is right and strict; §4.9
   should name `unspecified` in the unconditional row so an implementer reads it once.

4. **Detached coverage semantics.** SPEC.md §8.2 settles the reading: for a detached
   CAdES/CMS seal the signature is over the artifact's digest, so completeness follows from
   `intact`. `spec/verify.py` still returns `entire_file` as a copy of `valid` on that path,
   so vector 006 reports `entire_file: false` where §8.2 reads the signature as covering the
   whole file and `intact` carries the byte mismatch. Verdicts agree either way, and the
   field-level divergence is why 006 marks both `trusted` and `coverage` soft. Reporting
   coverage independently of `valid` on the detached path closes it, and it is a verifier
   work item now rather than a question.

5. **Anchor state vocabulary.** ~~The manifest enum uses states §3 does not name.~~
   **Closed for four of them.** SPEC.md §3.1 fixes `confirmed`, `pending`, `absent` and
   `unverified`, and `spec/verify.py` reports those four, mapping a missing client or a tool
   error onto `unverified` as §3.1 requires. One case is left without a name of its own: a
   proof that is well formed and commits to a **different** file, which vector 015 ships.
   This design reports it as `unverified`, since the verifier holds a proof it cannot check
   against the artifact in hand, and records the digest mismatch beside it. Whether §3.1
   wants a fifth state for it, or the `unverified` reading plus a stated cause, is the
   remaining question, and it travels with item 6.

6. **Digest binding of the anchor.** SPEC.md §3 says the `.ots` commits to the SHA-256 of
   the sealed document, and §8.3 step 4 has the verifier check the proof and report a state
   from §3.1. Neither says in so many words that the committed digest MUST be compared
   against the file in hand. Vector 015 tests that comparison, and it is the check that
   decides whether 015 reads as `unverified` or as a confirmed anchor for the wrong document.
   §8.3 step 4 should require it.

7. **The leaf preimage and the log wire shapes in SPEC.md §6.** ~~§6 writes the leaf without
   the `v` field, and leaves the STH and proof shapes undefined.~~ **Closed.** §6 now carries
   the `v` field, states that the member order is the one given there rather than a sorted
   one, and fixes the wire forms: the STH signature is ECDSA on P-256 over SHA-256 of the
   `letsseal.sth.v1` bytes, DER-encoded and carried as base64, served with `logCert` and
   `logChain` as PEM so an STH stands alone, and an inclusion proof carries `index`,
   `treeSize`, `leafHash`, `rootHash` and `proof`, with the first two REQUIRED for RFC 6962
   arithmetic. Vector 022 ships those shapes verbatim.

8. **Reporting beyond the SPEC.md vocabulary.** SPEC.md §8.4 and §3.1 have taken in what this
   suite used to propose: `unsealed` for a file that makes no claim, and the anchor states
   `absent` and `unverified`. `revoked` did not land as a verdict, and this design follows
   SPEC.md rather than keeping it: a revocation that reaches a seal withdraws trust, the
   verdict is `unrecognised`, and `revocationState` with the `revocation` object sits beside
   it (§1.2, vectors 009 and 011). What is still proposed to CONFORMANCE.md is the §1.1
   `reason` vocabulary and `issuerVerified`, the latter to sit alongside C-11. CONFORMANCE.md
   C-59 meanwhile still states three verdicts and two anchor states, which SPEC.md §8.4 and
   §3.1 supersede; restating C-59 in the specified vocabulary is the edit that closes this
   item. Until then the harness records what a verifier does not report as not applicable
   (§5).

9. **The revocation list's integrity story.** CPS.md §4.9 describes the published list as
   carrying a signature by the log key. `ca/setup-ca.sh revoke` writes
   `{version, revoked[], updated_at}`, and `signing-service/revocation.py`'s `published()`
   adds `fetched_at`, so the list's integrity today rests on the transport that delivers it.
   Either §4.9 states that as it stands, or the format gains the signature and the harness
   gains a step that verifies it. The suite's own list ships beside `SHA256SUMS`, which covers
   its digest, in the meantime.

10. **Reference verifier work items.** Lowercase coverage names, coverage reported
    independently of `valid` on the detached path (item 4), and structured `verdict` /
    `reason` / `issuerVerified` / `anchorState` / `revocationState` output, as §5 sets out.
    Revocation-list ingestion has landed as `--revocations`, so vectors 009 to 011 wait on
    their confirmed anchors alone.

11. **CI and publication checks.** `.github/workflows/ci.yml` runs `spec/vectors/run.py` and
    nothing else over this tree. `SHA256SUMS` verification and the key-pattern scan of §2.1
    belong in the same job (§2.1).

12. **CONFORMANCE.md open point 15 is stale.** It reads "`spec/vectors/` does not exist in
    the repository yet". The directory, its `manifest.json`, six vectors, `generate.py`,
    `run.py` and the CI step all exist, so C-58 is testable today for SPEC.md §2 and §8.
    Anchor and revocation vectors stay unshipped for the reason `README.md` gives: a
    confirmed ledger attestation cannot be manufactured offline, and a fabricated one in a
    conformance suite would undermine the only thing the suite is for. Open point 15 should
    be rewritten to say that.

13. **PAdES B-T.** The vectors are produced with `tsa_url=None`, so they carry one chain each
    (§3). A B-T vector needs the TSA root in `trustAnchors` and a stated reading for a
    timestamp chain outside the pinned root, which is a design question rather than a
    generator one.
