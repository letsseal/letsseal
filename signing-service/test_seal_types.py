"""
Round trip for XML-DSig, S/MIME, blob, identity, attestation and detached CAdES.

Each one is sealed, read back, and required to come out BOTH valid and trusted,
then tampered with and required to stop being valid. That pairing is the point:
a check that only asserts "sealing did not throw" stays green even when
verification rejects everything it is handed.

PAdES lives in test_seal.py and C2PA in test_c2pa.py; between the three, every
seal type Let's Seal issues has a test that asserts the verdict a recipient
actually sees.

Run:  ./.venv/bin/python test_seal_types.py
"""
import base64
import hashlib
import json
import os
import sys

CA_ROOT = "../ca/out/root-ca.crt"
ORG_P12 = "../ca/out/orgs/acme/signing.p12"
IDENTITY_P12 = "../ca/out/certs/_identity/issuer.p12"

P12_PASS = os.environ.get("LETSSEAL_P12_PASS", "")
if not P12_PASS:
    sys.exit("LETSSEAL_P12_PASS must be set to the passphrase ca/setup-ca.sh was run with.")

ARTIFACT = b"Let's Seal round-trip artifact\nsecond line, so newline handling is exercised.\n"
DIGEST = hashlib.sha256(ARTIFACT).hexdigest()
OTHER = hashlib.sha256(ARTIFACT + b"altered").hexdigest()

failures: list[str] = []


def check(seal_type: str, label: str, condition: bool) -> None:
    print(f"    {'ok  ' if condition else 'FAIL'}  {label}")
    if not condition:
        failures.append(f"{seal_type}: {label}")


def round_trip(seal_type: str, verdict: dict, tampered: list[tuple[str, dict]]) -> None:
    """Assert the shared shape: a genuine seal is valid AND trusted, and every
    tampered variant stops being valid."""
    print(f"  {seal_type}")
    check(seal_type, f"genuine seal is valid (signer={verdict.get('signer', '')[:40]})", bool(verdict.get("valid")))
    check(seal_type, "genuine seal chains to our root (trusted)", bool(verdict.get("trusted")))
    for label, after in tampered:
        check(seal_type, f"{label} is refused", not after.get("valid"))


def test_xmldsig() -> None:
    from xmldsig import sign_xml, verify_xml

    doc = b'<?xml version="1.0"?><invoice><total currency="GBP">1250.00</total></invoice>'
    signed, cn = sign_xml(doc, ORG_P12, P12_PASS)

    altered = signed.replace(b">1250.00<", b">9950.00<")
    assert altered != signed, "the tamper did not change the document"

    round_trip("xmldsig", verify_xml(signed, CA_ROOT),
               [("an altered amount", verify_xml(altered, CA_ROOT))])


def test_smime() -> None:
    from smime import sign_smime, verify_smime

    message = (b"From: billing@example.com\r\n"
               b"To: customer@example.org\r\n"
               b"Subject: Invoice 1042\r\n\r\n"
               b"Amount due: 1250.00 GBP\r\n")
    signed, cn = sign_smime(message, ORG_P12, P12_PASS)
    altered = signed.replace(b"1250.00", b"9950.00")
    assert altered != signed, "the tamper did not change the message"

    round_trip("smime", verify_smime(signed, CA_ROOT),
               [("an altered amount", verify_smime(altered, CA_ROOT))])


def test_blob() -> None:
    from blobsign import sign_blob_digest, verify_blob_digest

    res = sign_blob_digest(DIGEST, ORG_P12, P12_PASS)
    good = verify_blob_digest(DIGEST, res["sig_b64"], res["cert_pem"], CA_ROOT, res["chain_pem"])

    wrong_digest = verify_blob_digest(OTHER, res["sig_b64"], res["cert_pem"], CA_ROOT, res["chain_pem"])
    round_trip("blob", good, [
        ("a signature over different bytes", wrong_digest),
        ("a corrupted signature", verify_blob_digest(DIGEST, flip_b64(res["sig_b64"]),
                                                     res["cert_pem"], CA_ROOT, res["chain_pem"])),
    ])


def test_identity() -> None:
    from identity import issue_and_sign, verify_identity_digest

    if not os.path.isfile(IDENTITY_P12):
        raise FileNotFoundError(
            f"{IDENTITY_P12} is missing. Run: ca/setup-ca.sh identity-init")

    res = issue_and_sign(DIGEST, "signer@example.com", "https://accounts.google.com",
                         "google", IDENTITY_P12, P12_PASS, account_url="")
    good = verify_identity_digest(DIGEST, res["sig_b64"], res["cert_pem"], CA_ROOT, res.get("chain_pem", ""))
    print(f"    bound identity: {good.get('identity', '')}  issuer: {good.get('oidc_issuer', '')}")

    round_trip("identity", good, [
        ("a signature over different bytes",
         verify_identity_digest(OTHER, res["sig_b64"], res["cert_pem"], CA_ROOT, res.get("chain_pem", ""))),
        ("a corrupted signature",
         verify_identity_digest(DIGEST, flip_b64(res["sig_b64"]), res["cert_pem"], CA_ROOT,
                                res.get("chain_pem", ""))),
    ])
    check("identity", "the verified email is bound into the seal",
          good.get("identity") == "signer@example.com")


def test_attestation() -> None:
    from attest import sign_attestation, verify_attestation

    predicate = {"builder": {"id": "https://letsseal.org/test"}, "buildType": "round-trip"}
    res = sign_attestation(DIGEST, predicate, "slsaprovenance", ORG_P12, P12_PASS,
                           subject_name="artifact")
    good = verify_attestation(res["bundle"], res["cert_pem"], CA_ROOT,
                              res.get("chain_pem", ""), expected_sha256=DIGEST)

    wrong_subject = verify_attestation(res["bundle"], res["cert_pem"], CA_ROOT,
                                       res.get("chain_pem", ""), expected_sha256=OTHER)

    tampered_bundle = json.loads(json.dumps(res["bundle"]))
    dsse = tampered_bundle.get("dsseEnvelope") or tampered_bundle
    dsse["payload"] = base64.b64encode(
        base64.b64decode(dsse["payload"]).replace(b"round-trip", b"round-TRIP")
    ).decode()

    round_trip("attestation", good, [
        ("a tampered predicate", verify_attestation(tampered_bundle, res["cert_pem"], CA_ROOT,
                                                    res.get("chain_pem", ""))),
    ])
    check("attestation", "an attestation for another artifact is not accepted for this one",
          wrong_subject.get("subject_ok") is False)
    check("attestation", "the right artifact IS recognised as the subject",
          good.get("subject_ok") is True)


def test_detached() -> None:
    from detached import sign_detached_digest, verify_detached_bytes

    sig_b64 = sign_detached_digest(DIGEST, ORG_P12, P12_PASS)
    sig_der = base64.b64decode(sig_b64)

    good = verify_detached_bytes(ARTIFACT, sig_der, CA_ROOT)
    altered = verify_detached_bytes(ARTIFACT + b"appended", sig_der, CA_ROOT)

    round_trip("detached", good, [("an altered file", altered)])


def flip_b64(sig_b64: str) -> str:
    """Corrupt a base64 signature by flipping a byte in the decoded DER."""
    raw = bytearray(base64.b64decode(sig_b64))
    raw[len(raw) // 2] ^= 0xFF
    return base64.b64encode(bytes(raw)).decode()


def main() -> int:
    print("round trip: seal, verify, tamper, for every remaining seal type\n")
    for fn in (test_xmldsig, test_smime, test_blob, test_identity, test_attestation, test_detached):
        name = fn.__name__.removeprefix("test_")
        try:
            fn()
        except Exception as e:
            print(f"  {name}\n    FAIL  raised {type(e).__name__}: {e}")
            failures.append(f"{name}: raised {type(e).__name__}: {e}")
        print()

    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("ALL SEAL TYPES PASSED. Sealing, verification and tamper-evidence work.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
