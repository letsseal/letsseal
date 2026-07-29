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
```

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

**003 is the one to get right.** A cryptographically valid signature whose
certificate chains somewhere else is the forgery vector SPEC.md section 8 calls
out by name. An implementation that reports it as authentic accepts a seal from
anybody, which is the most dangerous defect a SEAL verifier can carry, and it is
easy to write by accident because every cryptographic check in it passes.

**004 catches the next one.** The signature is valid, the chain is good, and
content was added afterwards. A verifier that stops at "the signature verifies"
calls a modified document authentic.

Writing these caught a real defect in the reference verifier: it read only
pyHanko's `valid` and never `intact`, so it reported the altered document as
having an unrecognised issuer. The verdict was right and the reason was wrong,
which would send a reader after the wrong problem. That is the class of bug these
exist to find.

## The certificates

`root.crt` is the trust anchor the vectors ask you to pin. `other-root.crt`
issued vector 003 and is included so the failure is reproducible.

Both are throwaway CAs generated with the suite, never the published Let's Seal
root. Publishing fixtures under the real root would ask the world to trust a test
artifact, and an implementer needs an anchor they can point their own verifier at.
Private keys stay out of the repository; the publication gate rejects any file
matching a key pattern.

## Regenerating

```
../../signing-service/.venv/bin/python generate.py
```

This mints a fresh CA and re-seals every vector, so digests and certificates
change. Run `run.py` afterwards, and if a required verdict moved, work out why
before committing: either the expectation was wrong or something regressed.

## Coverage

The vectors cover the seal, which is sections 2 and 8 of the specification.

The anchor and revocation cases are specified in `DESIGN.md` and are not shipped
as fixtures yet, for one honest reason: a confirmed ledger attestation cannot be
manufactured offline, and shipping a fabricated one in a conformance suite would
undermine the only thing the suite is for. Anchor vectors need real proofs, which
means real confirmations, which takes ledger time. Revocation vectors depend on
the reason semantics in section 4.9 of the CPS and are the next ones to add.

If you are implementing and want a case that is missing, open an issue. A vector
someone actually needs is worth more than one we guessed at.
