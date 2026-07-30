# SEAL conformance vectors

Sealed artifacts paired with the exact verdict a conforming verifier reports for
each one, so an independent implementation can find out whether it is right.

Without these, someone writing a second implementation has no feedback at all.
They either give up, or ship something that looks correct and is subtly wrong in
the one case that matters. The negative vectors carry most of the value here: any
verifier can reach AUTHENTIC for a well-formed signature, and SPEC.md section 8 is
mostly about the cases where a verifier has to refuse.

## Use them

```
python run.py                       # check the reference verifier against every vector
```

Against your own implementation: read `manifest.json`, and for each entry verify
the `subject` file inside the vector's directory, pinning `root.crt` as the trust
anchor. Compare your verdict against `require`.

```
python ../verify.py 001-pades-valid/document.pdf --root root.crt
python ../verify.py 005-detached-valid/artifact.bin 005-detached-valid/artifact.bin.sig --root root.crt
python ../verify.py 008-revoked-key-compromise/document.pdf --root root.crt \
  --revocations 008-revoked-key-compromise/revocations.json
```

A vector may also carry inputs beyond the artifact, and a harness reads them from
the manifest entry: `revocations` names the list to consult, and `provenTime` the
moment a confirmed anchor establishes. Both matter from vector 008 onward.

## `require` versus `observed`

`require` is what a conforming verifier MUST report. Nothing else is constrained.

That distinction is deliberate. pyHanko declines to call an unintact signature
trusted, while another implementation may reasonably report the certificate chain
as fine and the bytes as changed. Both are correct, and a suite that failed the
second one would be testing an implementation rather than the standard. `observed`
records what the reference verifier says today, for information.

## The vectors

| id | what it is | required verdict |
|---|---|---|
| 001-pades-valid | a PAdES seal chaining to the pinned root | authentic |
| 002-pades-altered | 001 with one byte of visible text changed | intact false, authentic false |
| 003-pades-untrusted-root | a valid signature from a certificate outside the pinned root | trusted false, authentic false |
| 004-pades-incremental-update | content appended after signing | entire_file false, authentic false |
| 005-detached-valid | a detached CAdES/CMS seal over a non-PDF artifact | authentic |
| 006-detached-altered | that signature paired with a changed artifact | intact false, authentic false |
| 007-unsealed | an ordinary PDF that was never sealed | sealed false, authentic false |
| 008-revoked-key-compromise | 001's seal, its certificate revoked for compromise | revoked, unrecognised |
| 009-revoked-orderly-seal-earlier | retired in good order, the seal proven earlier | checked-clear, authentic |
| 010-revoked-orderly-seal-later | the same retirement, the seal proven later | revoked, unrecognised |
| 011-revoked-orderly-no-proven-time | the same retirement, no proven moment at all | revoked, unrecognised |
| 012-revoked-unknown-reason | a reason code outside the vocabulary | revoked, unrecognised |
| 013-revoked-intermediate | the issuing CA revoked, the signer itself unlisted | revoked, unrecognised |
| 014-revocation-unreachable | the list could not be fetched | unchecked, authentic |
| 015-revocation-clear | the list was read and reaches nothing here | checked-clear, authentic |
| 016-revocation-signed | a list carrying its own log-key signature | checked-clear, authentic |
| 017-revocation-signature-invalid | a forged revocation added to a signed list | unchecked, authentic |

**003 is the one to get right.** A cryptographically valid signature whose
certificate chains somewhere else is the forgery vector SPEC.md section 8 calls
out by name. An implementation that reports it as authentic accepts a seal from
anybody, which is the most dangerous defect a SEAL verifier can carry, and it is
easy to write by accident because every cryptographic check in it passes.

**004 catches the next one.** The signature is valid, the chain is good, and
content was added afterwards. A verifier that stops at "the signature verifies"
calls a modified document authentic.

**008 to 015 are about a list held somewhere else.** Seven of the eight carry the
same sealed document as 001, byte for byte. The seal is intact, the signature
verifies, the chain reaches the pinned root and the coverage is the whole file, in
every one of them, and the required verdict still moves between `authentic` and
`unrecognised` depending only on what the issuer published elsewhere. A verifier
that reads the artifact and nothing else cannot reach any of these answers, and this
is the part of SPEC.md section 8 an implementation is most likely to skip, because
everything in the file looks right.

**013 is the one to get right among them.** The certificate that signed the document
is not on the list; the intermediate that issued it is. Matching the signer's serial
alone passes 008 and fails this, and a compromised issuing CA is exactly the case
where the largest number of seals have to stop being trusted at once.

**009 against 010 and 011** is the rule that lets honest evidence survive a routine
key rotation. All three carry the same certificate and the same revocation entry.
009 clears because a proven moment places the seal before the retirement; 010 is
refused because the proven moment falls after it; 011 is refused because there is no
proven moment, so the claim that the seal came first rests on nothing.

**017 is the one that decides whether the mechanism is worth anything.** The list is
signed, and a forged entry naming this seal's certificate has been appended after
signing. A verifier that reads the list without checking the signature finds a
matching revocation and condemns a perfectly good document, which means anyone able
to interfere with the bytes on the way can revoke any seal they like. The signature
does not cover the forged entry, so a conforming verifier reports `unchecked` and
the seal stands. 016 is its pair: a signed list that verifies, so checking the
signature does not cost you the ordinary case.

Note what 017 must not do either. Reporting `checked-clear` would assert a check
made against bytes nobody vouched for. Reporting `revoked` is the attack succeeding.
`unchecked` is the only honest answer, and it is the state SPEC.md §8.3 step 5
requires.

### Proven time, and the one input you must not take on trust

The revocation vectors carry a `provenTime`, the moment a confirmed anchor
establishes for the artifact. The suite ships no anchor proof, so it hands the
verifier that moment directly.

That is a testing convenience and nothing more. In production a verifier MUST take
the moment from a confirmed anchor, as CONFORMANCE C-42 requires, because the
alternative is letting whoever holds a revoked key nominate the date the check runs
against. Vector 011 is what that rule looks like when the evidence is missing.

Two invariants these vectors hold an implementation to, both easy to miss and
neither visible from a passing signature. A verdict has to be reached from `intact`
as well as `valid`, so that moved bytes are reported as moved bytes rather than as an
issuer problem and a reader is sent after the right thing. And revocation has to be
matched against every certificate in the chain rather than the signer's alone, so
that withdrawing trust from an issuing CA withdraws it from everything issued under
that CA. 002 and 013 are the vectors that will tell you.

## The certificates

`root.crt` is the trust anchor the vectors ask you to pin. `other-root.crt`
issued vector 003 and is included so the failure is reproducible. Vector 013 is
signed under an intermediate that chains to `root.crt`, carried in the signature
itself, so no extra file is needed to build the path.

Both roots are throwaway CAs generated with the suite, never the published Let's
Seal root. Publishing fixtures under the real root would ask the world to trust a
test artifact, and an implementer needs an anchor they can point their own verifier
at. Private keys stay out of the repository; the publication gate rejects any file
matching a key pattern.

## Regenerating

```
../../signing-service/.venv/bin/python generate.py
```

The suite's CA is reused when its key is still in `.keys/`, so the trust anchor you
pinned survives a regeneration. Vector bytes do move: PAdES output varies on every
run from the certificate serial and the ECDSA nonce, so the anchor is the part that
holds and the digests are not reproducible by construction. Run `run.py` afterwards,
and if a required verdict moved, work out why before committing: either the
expectation was wrong or something regressed.

## Coverage

The vectors cover the seal and revocation, which is sections 2, 8.3 step 5 and 8.4
of the specification, and the reason semantics of section 4.9 of the CPS.

Anchor vectors are absent, for one honest reason: a confirmed ledger attestation
cannot be manufactured offline, and shipping a fabricated one in a conformance suite
would undermine the only thing the suite is for. They need real proofs, which means
real confirmations, which takes ledger time. The revocation vectors reach around that
by carrying the proven moment as an input rather than as a proof, which is why the
section above is blunt about what that input is worth.

The transparency log of section 6 has no fixtures either. Its arithmetic is RFC 6962
unchanged and the entry encoding is what SEAL adds, so a vector there would be a leaf
preimage and an audit path rather than a sealed artifact.

If you are implementing and want a case that is missing, open an issue. A vector
someone actually needs is worth more than one we guessed at.
