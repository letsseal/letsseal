"""
C2PA round trip: seal an image -> read the manifest back -> confirm the verdict
is Trusted -> flip a byte and confirm it stops being trusted.

A verification library is the kind of dependency whose upgrade can invalidate
already-issued seals without any code of ours changing, so the round trip is
asserted per seal type rather than per signing stack: covering one seal type
says nothing about the others.

The failure guarded against here is specific and easy to miss. The signature,
the certificate chain and the hash binding can all keep verifying while only the
manifest SHAPE is rejected, and a check that asserts merely "sealing did not
throw" stays green throughout. This asserts the VERDICT a recipient sees.

Run:  ./.venv/bin/python test_c2pa.py
"""
import io
import os
import struct
import sys
import zlib

from c2pa_seal import sign_c2pa, verify_c2pa

CA_ROOT = "../ca/out/root-ca.crt"
ORG_P12 = "../ca/out/orgs/acme/signing.p12"

P12_PASS = os.environ.get("LETSSEAL_P12_PASS", "")
if not P12_PASS:
    sys.exit("LETSSEAL_P12_PASS must be set to the passphrase ca/setup-ca.sh was run with.")


def make_png(width: int = 64, height: int = 64) -> bytes:
    """A real PNG, built here so the test needs no binary fixture. c2pa decodes
    the image, so arbitrary bytes with a PNG header would not do."""
    rows = b"".join(
        b"\x00" + b"".join(bytes([(x * 4) % 256, (y * 4) % 256, 160]) for x in range(width))
        for y in range(height)
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows))
            + chunk(b"IEND", b""))


def main() -> int:
    print("==> generating test PNG")
    original = make_png()

    print("==> sealing with the org cert")
    sealed, cn = sign_c2pa(original, "image/png", ORG_P12, P12_PASS, title="round-trip test")
    print(f"    sealed by CN={cn}  {len(sealed)} bytes")

    print("==> reading the manifest back and checking the verdict")
    verdict = verify_c2pa(sealed, "image/png", CA_ROOT)
    print(f"    sealed={verdict['sealed']}  valid={verdict['valid']}  "
          f"trusted={verdict['trusted']}  state={verdict.get('validation_state')}")

    if not verdict["sealed"]:
        print("FAIL: a freshly sealed image reports no manifest")
        return 1
    if not verdict["valid"]:
        print(f"FAIL: a freshly sealed image is not valid (state={verdict.get('validation_state')}).")
        print("      The signature and hash binding may still be fine; check whether the")
        print("      c2pa library now rejects the manifest shape built in c2pa_seal._manifest.")
        return 1
    if not verdict["trusted"]:
        print("FAIL: a freshly sealed image does not chain to our root")
        return 1

    if verdict.get("legacy_manifest"):
        print("FAIL: a freshly sealed image took the legacy path; it should be conformant")
        return 1

    print("==> tamper test: flip a byte in the covered payload")
    detected, uncovered = tamper_sweep(sealed)
    print(f"    {detected} of {detected + uncovered} offsets detected, "
          f"{uncovered} inside the excluded manifest region")
    if detected == 0:
        print("FAIL: no tampering was detected anywhere in the file")
        return 1

    if legacy_checks(original) != 0:
        return 1


def tamper_sweep(sealed: bytes, mime: str = "image/png") -> tuple[int, int]:
    """Flip one byte at many offsets; count detections and excluded-region hits."""
    detected = uncovered = 0
    for pct in range(2, 100, 2):
        broken = bytearray(sealed)
        broken[int(len(sealed) * pct / 100)] ^= 0xFF
        if verify_c2pa(bytes(broken), mime, CA_ROOT)["valid"]:
            uncovered += 1
        else:
            detected += 1
    return detected, uncovered

    print("\nALL CHECKS PASSED. C2PA sealing, verification and tamper-evidence work.")
    return 0


def seal_with_legacy_manifest(image: bytes) -> bytes:
    """Produce a seal in the pre-conformance shape: `c2pa.created` with no
    `digitalSourceType`. Built here rather than checked in as a fixture so it is
    signed by the same throwaway CA the rest of the test uses."""
    from c2pa import Builder, Signer, Context, C2paSigningAlg
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from c2pa_seal import _load_signer

    key, chain_pem, _ = _load_signer(ORG_P12, P12_PASS)
    manifest = {
        "claim_generator_info": [{"name": "Let's Seal", "version": "1.0.0"}],
        "title": "legacy", "format": "image/png",
        "assertions": [{"label": "c2pa.actions", "data": {"actions": [{"action": "c2pa.created"}]}}],
    }
    out = io.BytesIO()
    with Signer.from_callback(lambda d: key.sign(d, ec.ECDSA(hashes.SHA256())),
                              C2paSigningAlg.ES256, chain_pem, None) as signer, \
            Context() as ctx, Builder(manifest, ctx) as builder:
        builder.sign(signer, "image/png", io.BytesIO(image), out)
    return out.getvalue()


def legacy_checks(original: bytes) -> int:
    """Seals issued before the manifest carried a digital source type must keep
    verifying, and a TAMPERED one of those must still be refused.

    The second half is the one that matters. The compatibility path exists to
    forgive a missing field, and the failure mode to fear is that it quietly
    forgives an altered image as well, which would turn the product's core claim
    inside out."""
    print("==> legacy manifest: a seal made before the source-type rule")
    legacy = seal_with_legacy_manifest(original)
    v = verify_c2pa(legacy, "image/png", CA_ROOT)
    print(f"    valid={v['valid']}  trusted={v['trusted']}  "
          f"legacy={v.get('legacy_manifest', False)}  state={v.get('validation_state')}")
    if not (v["valid"] and v["trusted"]):
        print("FAIL: an intact seal from before the rule change no longer verifies.")
        print("      Copies already distributed cannot be re-sealed, so this must hold.")
        return 1
    if not v.get("legacy_manifest"):
        print("FAIL: it verified, but was not flagged as the legacy shape")
        return 1

    print("==> legacy manifest, TAMPERED: must still be refused")
    detected, uncovered = tamper_sweep(legacy)
    print(f"    {detected} of {detected + uncovered} offsets refused, "
          f"{uncovered} inside the excluded manifest region")
    if detected == 0:
        print("FAIL: a tampered legacy seal was accepted everywhere.")
        print("      The compatibility path forgives a missing field, not a changed image.")
        return 1

    print("==> legacy path forgives the missing field and nothing else")
    divergences = 0
    for pct in range(2, 100, 2):
        broken = bytearray(legacy)
        broken[int(len(legacy) * pct / 100)] ^= 0xFF
        broken = bytes(broken)
        accepted = verify_c2pa(broken, "image/png", CA_ROOT)["valid"]
        if accepted != crypto_is_clean(broken):
            print(f"FAIL: at offset {pct}% the legacy path said valid={accepted} "
                  f"but the validator disagrees about the cryptography")
            divergences += 1
    if divergences:
        return 1
    print(f"    49 offsets, 0 divergences from the validator's own verdict")
    return 0


def crypto_is_clean(data: bytes, mime: str = "image/png") -> bool:
    """Whether the reference validator finds NO fault beyond the missing source
    type. Read straight from the library so the comparison is against its
    judgement, not a restatement of ours."""
    import json
    from c2pa import Reader, Context
    from c2pa_seal import _status_codes

    cfg = {"trust": {"user_anchors": open(CA_ROOT).read()}, "verify": {"verify_trust": True}}
    try:
        with Context.from_dict(cfg) as ctx:
            with Reader(mime, io.BytesIO(data), context=ctx) as reader:
                store = json.loads(reader.json())
    except Exception:
        return False
    return not (_status_codes(store)["failure"] - {"assertion.action.malformed"})


if __name__ == "__main__":
    sys.exit(main())
