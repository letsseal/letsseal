#!/usr/bin/env python3
"""The revocation list signs itself, and the reference verifier agrees.

CPS §4.9 undertakes that the published list "carries its own integrity through a
signature by the log key". This is the test that the undertaking is true, that the
signature survives the journey to a reader, and that it actually refuses the things
it exists to refuse.

Self-contained: mints a throwaway CA and log key in a temp directory, so it needs no
provisioned CA and no passphrase, unlike test_revocation.py. That matters because
this asserts a wire format rather than an operational behaviour, and a format test
that only runs where the real keys live does not run often enough.

Run:  ./.venv/bin/python test_revocation_signature.py
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, os.pardir, "spec"))

FAILED = []


def check(name: str, ok: bool) -> None:
    print(f"{'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        FAILED.append(name)


def sh(*args: str) -> None:
    subprocess.run(args, check=True, capture_output=True)


def mint_ca(work: str) -> tuple[str, str]:
    """A throwaway root and a log key under it. Returns (root.crt, log.p12)."""
    sh("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", f"{work}/root.key")
    sh("openssl", "req", "-x509", "-new", "-nodes", "-key", f"{work}/root.key", "-sha256",
       "-days", "3650", "-out", f"{work}/root.crt", "-subj", "/CN=Test Root/O=T/C=GB")
    sh("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", f"{work}/log.key")
    sh("openssl", "req", "-new", "-key", f"{work}/log.key", "-out", f"{work}/log.csr",
       "-subj", "/CN=Test Log/O=T/C=GB")
    sh("openssl", "x509", "-req", "-in", f"{work}/log.csr", "-CA", f"{work}/root.crt",
       "-CAkey", f"{work}/root.key", "-set_serial", "0x01", "-sha256", "-days", "3650",
       "-out", f"{work}/log.crt")
    sh("openssl", "pkcs12", "-export", "-out", f"{work}/log.p12", "-inkey", f"{work}/log.key",
       "-in", f"{work}/log.crt", "-certfile", f"{work}/root.crt", "-passout", "pass:pw")
    return f"{work}/root.crt", f"{work}/log.p12"


def main() -> int:
    work = tempfile.mkdtemp(prefix="seal-revsig-")
    os.environ["LETSSEAL_CA_DIR"] = work
    root_crt, log_p12 = mint_ca(work)

    import translog
    import revocation
    import verify as V

    V.set_pinned_root(root_crt)
    signer = lambda d: translog.sign_revocations(d, log_p12, "pw")

    disk = {"version": 1, "updated_at": "2026-06-01T00:00:00Z", "revoked": [
        {"note": "", "reason": "key_compromise", "revoked_at": "2026-06-01T00:00:00Z",
         "serial": "0a1b", "subject": "CN=Gone"}]}
    with open(os.path.join(work, "revoked.json"), "w") as fh:
        fh.write(json.dumps(disk, indent=2, sort_keys=True) + "\n")

    pub = revocation.published(sign=signer)

    check("published carries signature, logCert and logChain",
          all(k in pub for k in ("signature", "logCert", "logChain")))

    check("signer and reference verifier build identical signed bytes",
          translog.revocations_bytes(disk) == V.revocations_bytes(pub))

    check("the tag is the domain separator SPEC.md §8.5 fixes",
          V.revocations_bytes(pub).startswith(b"letsseal.revocations.v1\n"))

    check("fetched_at is outside the signature",
          V.revocations_bytes(pub) == V.revocations_bytes(
              {k: v for k, v in pub.items() if k != "fetched_at"}))

    check("a genuine list verifies", V._revocation_list_authentic(pub))

    wire = json.loads(json.dumps(json.loads(json.dumps(pub))))
    check("survives re-serialisation in transit", V._revocation_list_authentic(wire))
    check("survives the evidence-bundle rewrap",
          V._revocation_list_authentic({"note": "snapshot", **wire}))

    tampered_reason = json.loads(json.dumps(pub))
    tampered_reason["revoked"][0]["reason"] = "superseded"
    check("refuses a changed reason", not V._revocation_list_authentic(tampered_reason))

    stripped = json.loads(json.dumps(pub))
    stripped["revoked"] = []
    check("refuses a stripped entry", not V._revocation_list_authentic(stripped))

    reordered = json.loads(json.dumps(pub))
    reordered["revoked"] = [
        {"serial": "ffff", "subject": "CN=Other", "reason": "superseded",
         "revoked_at": "2026-05-01T00:00:00Z", "note": ""},
        reordered["revoked"][0]]
    check("refuses a reordered list", not V._revocation_list_authentic(reordered))

    stale_date = json.loads(json.dumps(pub))
    stale_date["updated_at"] = "2020-01-01T00:00:00Z"
    check("refuses a changed updated_at", not V._revocation_list_authentic(stale_date))

    sh("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", f"{work}/o.key")
    sh("openssl", "req", "-x509", "-new", "-nodes", "-key", f"{work}/o.key", "-sha256",
       "-days", "3650", "-out", f"{work}/o.crt", "-subj", "/CN=Outsider/O=X/C=GB")
    sh("openssl", "pkcs12", "-export", "-out", f"{work}/o.p12", "-inkey", f"{work}/o.key",
       "-in", f"{work}/o.crt", "-certfile", f"{work}/o.crt", "-passout", "pass:pw")
    outsider = dict(disk)
    outsider.update(translog.sign_revocations(disk, f"{work}/o.p12", "pw"))
    check("refuses a signature from outside the pinned root",
          not V._revocation_list_authentic(outsider))

    good = os.path.join(work, "good.json")
    with open(good, "w") as fh:
        json.dump(pub, fh)
    check("a signed list is consulted", V.check_revocation(["0a1b"], good)[0] == "revoked")

    bad = os.path.join(work, "bad.json")
    with open(bad, "w") as fh:
        json.dump(stripped, fh)
    check("an unverifiable list reports unchecked, not clear",
          V.check_revocation(["0a1b"], bad)[0] == "unchecked")

    plain = os.path.join(work, "plain.json")
    with open(plain, "w") as fh:
        json.dump(disk, fh)
    check("an unsigned list is still consulted",
          V.check_revocation(["0a1b"], plain)[0] == "revoked")

    def explode(_doc):
        raise RuntimeError("key unavailable")

    logging.getLogger("revocation").setLevel(logging.CRITICAL)
    fallback = revocation.published(sign=explode)
    logging.getLogger("revocation").setLevel(logging.NOTSET)
    check("signing failure publishes the list unsigned rather than withholding it",
          "revoked" in fallback and "signature" not in fallback)

    check("an unchanged list keeps one signature",
          revocation.published(sign=signer)["signature"] == pub["signature"])
    check("a different signing key produces a different signature",
          translog.sign_revocations(disk, f"{work}/o.p12", "pw")["signature"]
          != translog.sign_revocations(disk, log_p12, "pw")["signature"])

    sh("openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", f"{work}/i.key")
    sh("openssl", "req", "-new", "-key", f"{work}/i.key", "-out", f"{work}/i.csr",
       "-subj", "/CN=Test Intermediate/O=T/C=GB")
    with open(f"{work}/i.ext", "w") as fh:
        fh.write("basicConstraints=critical,CA:TRUE,pathlen:0\n"
                 "keyUsage=critical,keyCertSign,cRLSign\n")
    sh("openssl", "x509", "-req", "-in", f"{work}/i.csr", "-CA", root_crt,
       "-CAkey", f"{work}/root.key", "-set_serial", "0x7", "-sha256", "-days", "3650",
       "-out", f"{work}/i.crt", "-extfile", f"{work}/i.ext")
    with open(f"{work}/i.crt", "rb") as fh:
        inter_pem = fh.read()
    with open(root_crt, "rb") as fh:
        root_pem_bytes = fh.read()

    anchors, helpers = V._split_anchors(inter_pem + root_pem_bytes)
    names = lambda cs: [c.subject.native["common_name"] for c in cs]
    check("pinning a chain trusts only the self-signed root",
          names(anchors) == ["Test Root"])
    check("the intermediate in a pinned chain is path material, not an anchor",
          names(helpers) == ["Test Intermediate"])
    bare_anchors, bare_helpers = V._split_anchors(root_pem_bytes)
    check("pinning a bare root still yields exactly one anchor and no helpers",
          len(bare_anchors) == 1 and bare_helpers == [])

    print()
    if FAILED:
        print(f"{len(FAILED)} check(s) failed: {', '.join(FAILED)}")
        return 1
    print("all revocation-signature checks pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
