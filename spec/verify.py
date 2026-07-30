#!/usr/bin/env python3
"""
SEAL reference verifier — Sealed Evidence, Anchored to a Ledger.

Verifies a sealed file against the PUBLISHED Let's Seal root and its OpenTimestamps
anchor, with no Let's Seal server involved. Reference for the SEAL standard:
https://letsseal.org/standard

  seal    an AdES signature valid, chaining to the pinned root, covering the whole
          file. PDFs carry it embedded (PAdES); any other file uses a detached
          sidecar (CAdES/CMS, `file.sig`).   ->  integrity + issuer
  anchor  `ots verify` confirms the file's SHA-256 on the Bitcoin ledger  ->  time

Requires: pyhanko (pip install pyhanko); for detached (.sig) seals, `openssl`; for
the anchor, the `ots` client (pip install opentimestamps-client).

Usage:  python verify.py sealed.pdf [sealed.pdf.ots]
        python verify.py file file.sig [file.ots]

Options:
  --root <pem>          pin a different trust anchor: your own CA when
                        self-hosting, or the throwaway CA that issued the
                        conformance vectors in spec/vectors/. Defaults to the
                        published Let's Seal root below.
  --attime <unix>       check certificate validity at that moment rather than now
  --check-revocation    consult CRL/OCSP online, hard-fail
"""
import sys
import re
import json
import urllib.request
import os
import hashlib
import subprocess
import tempfile
from datetime import datetime, timezone
from io import BytesIO

from asn1crypto import pem, x509
from pyhanko_certvalidator import ValidationContext
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.pdf_utils.reader import PdfFileReader

ROOT_CA_PEM = b"""-----BEGIN CERTIFICATE-----
MIIB4zCCAYmgAwIBAgIUATVQI6DoAl9fR1Pz/qKcw8P6TKAwCgYIKoZIzj0EAwIw
PzEbMBkGA1UEAwwSTGV0J3MgU2VhbCBSb290IENBMRMwEQYDVQQKDApMZXQncyBT
ZWFsMQswCQYDVQQGEwJHQjAeFw0yNjA3MDgxNTU5MjVaFw00NjA3MDMxNTU5MjVa
MD8xGzAZBgNVBAMMEkxldCdzIFNlYWwgUm9vdCBDQTETMBEGA1UECgwKTGV0J3Mg
U2VhbDELMAkGA1UEBhMCR0IwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAATFa+q0
LI7qV4N6b5T7Xuzcy4v6IengyFN8ZWAGsNrF1mHptXIMEUCXUEr1GQpD1FTrfgQO
6HVgXPT2IP2jTJqfo2MwYTAdBgNVHQ4EFgQUEWlQwM1fR/iBgTKigc39MweT+W0w
HwYDVR0jBBgwFoAUEWlQwM1fR/iBgTKigc39MweT+W0wDwYDVR0TAQH/BAUwAwEB
/zAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwIDSAAwRQIhAN5l2xxn8QypEGK1
VZyHj7fpLRM+79zXT/ujRuUnKkq3AiB+mGJMM3EeeTS0tAhBkskqqv7wnAP9sUqv
KRxDgmn9IQ==
-----END CERTIFICATE-----"""

INTERMEDIATE_CA_PEM = b"""-----BEGIN CERTIFICATE-----
MIIB7jCCAZSgAwIBAgIUfNkJ39i0FgJYfTluWJ9r1yJ+6BowCgYIKoZIzj0EAwIw
PzEbMBkGA1UEAwwSTGV0J3MgU2VhbCBSb290IENBMRMwEQYDVQQKDApMZXQncyBT
ZWFsMQswCQYDVQQGEwJHQjAeFw0yNjA3MDgxNTU5MjVaFw0zNjA3MDUxNTU5MjVa
MEcxIzAhBgNVBAMMGkxldCdzIFNlYWwgSW50ZXJtZWRpYXRlIENBMRMwEQYDVQQK
DApMZXQncyBTZWFsMQswCQYDVQQGEwJHQjBZMBMGByqGSM49AgEGCCqGSM49AwEH
A0IABHMYligVeveOEhi1rXr+n4vDxAJLOMWT+iH8SlBM63y1caVXfvzCvxCA2zLw
0aH7eQXOfcVVUcTaFZyxGSZR3J+jZjBkMBIGA1UdEwEB/wQIMAYBAf8CAQAwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTZL6q5xRz/dBEcDQsvgu/9f+e6LzAfBgNV
HSMEGDAWgBQRaVDAzV9H+IGBMqKBzf0zB5P5bTAKBggqhkjOPQQDAgNIADBFAiEA
wfdmYl60OuFSjJvINcH72KQkKyEOgqVnLpikKJDghH4CIEpS0JP1usQFv4LUta54
wwkVfGqYbg43R+TscPWhSW80
-----END CERTIFICATE-----"""


_PINNED_ROOT = _ROOT_OVERRIDE = None


def set_pinned_root(pem_path=None):
    """Pin a root from a PEM file, or restore the published Let's Seal root."""
    global _PINNED_ROOT, _ROOT_OVERRIDE
    _ROOT_OVERRIDE = open(pem_path, "rb").read() if pem_path else None
    _PINNED_ROOT = None


def root_pem():
    return _ROOT_OVERRIDE if _ROOT_OVERRIDE is not None else ROOT_CA_PEM


def _load(pem_bytes):
    _, _, der = pem.unarmor(pem_bytes)
    return x509.Certificate.load(der)


def verify_seal(pdf_bytes, at_time=None, check_revocation=False):
    reader = PdfFileReader(BytesIO(pdf_bytes))
    sigs = reader.embedded_signatures
    if not sigs:
        return {"sealed": False}
    pinned = root_pem()
    roots = [_load(b"-----BEGIN CERTIFICATE-----" + p) for p in pinned.split(b"-----BEGIN CERTIFICATE-----")[1:]]
    vc = ValidationContext(
        trust_roots=roots,
        other_certs=[] if _ROOT_OVERRIDE is not None else [_load(INTERMEDIATE_CA_PEM)],
        allow_fetching=check_revocation,
        revocation_mode="hard-fail" if check_revocation else "soft-fail",
        moment=at_time,
    )
    status = validate_pdf_signature(sigs[0], vc)
    coverage = getattr(status.coverage, "name", str(status.coverage))
    return {
        "sealed": True,
        "intact": bool(status.intact),
        "valid": bool(status.valid),
        "trusted": bool(status.trusted),
        "entire_file": coverage == "ENTIRE_FILE",
        "coverage": coverage,
        "signer": status.signing_cert.subject.human_friendly,
        "serial": format(status.signing_cert.serial_number, "x"),
        "serials": _chain_serials(sigs[0].signed_data),
    }


def _chain_serials(signed_data):
    """Every certificate serial the signature carries, as lowercase hex.

    Revocation is matched against all of them rather than the signer alone, because
    revoking an intermediate withdraws trust from every certificate issued under it
    (CONFORMANCE C-39). Returns an empty list where the certificates cannot be read,
    which check_revocation reports as `unchecked` rather than clear.
    """
    try:
        return [format(c.chosen.serial_number, "x") for c in signed_data["certificates"]]
    except Exception:
        return []


def _detached_signer(sig_path):
    """Best-effort signer name from a detached CMS (the embedded leaf cert)."""
    try:
        from asn1crypto import cms
        sd = cms.ContentInfo.load(open(sig_path, "rb").read())["content"]
        certs = [c.chosen for c in sd["certificates"]]

        def is_ca(c):
            bc = c.basic_constraints_value
            return bool(bc and bc["ca"].native)

        leaf = next((c for c in certs if not is_ca(c)), certs[0])
        return leaf.subject.human_friendly
    except Exception:
        return ""


def _detached_chain_serials(sig_path):
    """Every certificate serial embedded in a detached CMS, as lowercase hex (C-39)."""
    try:
        from asn1crypto import cms
        with open(sig_path, "rb") as fh:
            sd = cms.ContentInfo.load(fh.read())["content"]
        return _chain_serials(sd)
    except Exception:
        return []


def _detached_serial(sig_path):
    """The signing certificate's serial, as lowercase hex, read from the signature."""
    try:
        out = subprocess.run(["openssl", "pkcs7", "-inform", "DER", "-in", sig_path,
                              "-print_certs", "-noout", "-text"],
                             capture_output=True, text=True, timeout=15).stdout
        m = re.search(r"Serial Number:\s*\n?\s*([0-9a-fA-F:\s]+)", out)
        if m:
            return m.group(1).replace(":", "").split()[0].lower()
    except Exception:
        pass
    return None


def verify_detached(file_path, sig_path, at_time=None, timeout=30):
    """Verify a detached CAdES/CMS seal (file.sig) over `file_path` against the
    published root, with stock openssl. The signer's chain is embedded in the
    sig, so pinning the root is enough. Two checks mirror the PAdES path: the
    signature alone (valid) and the chain to the root (trusted).

    Cert validity is checked at `at_time` (unix seconds, the anchor's proven
    block time when supplied), else at the current time. This replaces the old
    blanket time bypass, which let an expired or leaked leaf validate forever."""
    with tempfile.NamedTemporaryFile("wb", suffix=".pem", delete=False) as rf:
        rf.write(root_pem())
        root = rf.name

    time_args = ["-attime", str(int(at_time))] if at_time else []

    def _openssl(*extra):
        try:
            r = subprocess.run(
                ["openssl", "cms", "-verify", "-inform", "DER", "-in", sig_path,
                 "-content", file_path, "-binary", "-out", os.devnull, *time_args, *extra],
                capture_output=True, text=True, timeout=timeout,
            )
            return r.returncode == 0 and "verification successful" in (r.stdout + r.stderr).lower()
        except Exception:
            return None

    try:
        valid = _openssl("-noverify")
        trusted = _openssl("-CAfile", root)
    finally:
        os.unlink(root)

    if valid is None or trusted is None:
        return {"sealed": True, "detached": True, "intact": False, "valid": False, "trusted": False,
                "entire_file": False, "signer": "(openssl unavailable)"}
    return {"sealed": True, "detached": True, "intact": bool(valid), "valid": bool(valid),
            "serial": _detached_serial(sig_path), "serials": _detached_chain_serials(sig_path),
            "trusted": bool(trusted),
            "entire_file": bool(valid), "signer": _detached_signer(sig_path)}


def verify_anchor(file_path, ots_path):
    """Check an OpenTimestamps proof. Returns (state, attested_unix).

    `state` is one of the four SPEC.md section 3.1 states. A tool failure reports
    `unverified` rather than `pending`, because `pending` asserts that a calendar
    accepted the digest, which is a claim about the proof, while an inability to
    look asserts nothing at all.

    `attested_unix` is the moment the ledger attests to, where the client reports
    one. SPEC.md section 8.3 makes it the moment certificate validity is judged, so
    it has to come back with the state rather than being read off the screen.
    """
    try:
        r = subprocess.run(
            ["ots", "verify", "-f", file_path, ots_path],
            capture_output=True, text=True, timeout=90,
        )
        out = (r.stdout + r.stderr)
        low = out.lower()
        if "success" in low or "block" in low:
            return "confirmed", _attested_time(out)
        if "pending" in low or "not been confirmed" in low or "incomplete" in low:
            return "pending", None
        return "unverified", None
    except FileNotFoundError:
        return "unverified", None
    except Exception:
        return "unverified", None


def _attested_time(text):
    """The date an ots client reports for a confirmed attestation, as unix seconds.

    Returns None when no date can be read. That matters: a confirmed anchor whose
    time cannot be parsed still confirms existence, but it cannot be used to fix the
    validity moment, and the verifier says which moment it used rather than quietly
    choosing one.
    """
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if not m:
        return None
    y, mo, d = (int(g) for g in m.groups())
    try:
        return int(datetime(y, mo, d, tzinfo=timezone.utc).timestamp())
    except ValueError:
        return None


_UNCONDITIONAL = {"key_compromise", "ca_compromise", "unspecified"}


_ORDERLY = {"superseded", "cessation_of_operation", "affiliation_changed", "privilege_withdrawn"}


def check_revocation(serials, source, sealed_at=None):
    """Returns (state, entry). state is checked-clear, revoked, or unchecked.

    `serials` is every certificate serial in the chain the seal presents, since
    revoking an intermediate withdraws trust from everything issued under it (C-39).
    A single serial is accepted too. With no list to read, or no serial to match
    against, the state is `unchecked`: reporting clear would assert a check that did
    not happen (C-68).
    """
    if isinstance(serials, str) or serials is None:
        serials = [serials] if serials else []
    want = {str(s).lower().lstrip("0") for s in serials if s}
    if not source or not want:
        return "unchecked", None
    try:
        if source.startswith("http://") or source.startswith("https://"):
            with urllib.request.urlopen(source, timeout=15) as fh:
                doc = json.load(fh)
        else:
            with open(source) as fh:
                doc = json.load(fh)
    except Exception:
        return "unchecked", None

    cleared = None
    for e in doc.get("revoked", []):
        if str(e.get("serial", "")).lower().lstrip("0") not in want:
            continue
        if _reaches_this_seal(e, sealed_at):
            return "revoked", e
        cleared = e
    return "checked-clear", cleared


def _reaches_this_seal(entry, sealed_at):
    """Does this revocation entry withdraw trust from a seal made at `sealed_at`?

    A compromise reaches every seal under the certificate whatever its date (C-40).
    An orderly retirement leaves seals demonstrably made before the revocation date
    standing (C-41), and the evidence for `sealed_at` is a confirmed anchor (C-42):
    with no proven moment the date claim rests on nothing, so the entry reaches this
    seal. A reason not on either list is handled as a compromise (C-43).
    """
    reason = str(entry.get("reason", "")).lower()
    if reason in _UNCONDITIONAL or reason not in _ORDERLY:
        return True
    revoked_at = entry.get("revoked_at")
    if not sealed_at or not revoked_at:
        return True
    try:
        when = datetime.strptime(revoked_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    return not sealed_at < int(when.timestamp())


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    args = sys.argv[1:]
    flags = {"--attime", "--root", "--revocations"}
    positional = [a for i, a in enumerate(args)
                  if not a.startswith("--") and not (i and args[i - 1] in flags)]
    file_path = positional[0]
    sig_path = next((a for a in positional[1:] if a.endswith(".sig")), None)
    ots_path = next((a for a in positional[1:] if a.endswith(".ots")), None)
    at_unix = int(args[args.index("--attime") + 1]) if "--attime" in args else None
    check_rev = "--check-revocation" in args
    if "--root" in args:
        set_pinned_root(args[args.index("--root") + 1])
    revocations = args[args.index("--revocations") + 1] if "--revocations" in args else None
    file_bytes = open(file_path, "rb").read()
    is_pdf = file_bytes[:5] == b"%PDF-"
    if sig_path is None and not is_pdf and os.path.exists(file_path + ".sig"):
        sig_path = file_path + ".sig"
    if ots_path is None and os.path.exists(file_path + ".ots"):
        ots_path = file_path + ".ots"

    print(f"file     {file_path}")
    print(f"sha256   {hashlib.sha256(file_bytes).hexdigest()}")

    attested = None
    if ots_path and os.path.exists(ots_path):
        anchor, attested = verify_anchor(file_path, ots_path)
    else:
        anchor = "absent"

    if at_unix is None and anchor == "confirmed" and attested is not None:
        at_unix = attested
        moment = f"at the anchored time {at_unix}"
    elif at_unix is not None:
        moment = f"at the supplied time {at_unix}"
    else:
        moment = "at the current time"
    at_moment = datetime.fromtimestamp(at_unix, tz=timezone.utc) if at_unix else None

    if is_pdf:
        s = verify_seal(file_bytes, at_time=at_moment, check_revocation=check_rev)
        if not s["sealed"]:
            print("\nRESULT   UNSEALED. No signature is present.")
            sys.exit(1)
        kind = s["coverage"]
    elif sig_path:
        s = verify_detached(file_path, sig_path, at_time=at_unix)
        kind = "detached CMS"
    else:
        print("\nRESULT   UNSEALED. No embedded signature and no .sig sidecar.")
        sys.exit(1)

    authentic = s["intact"] and s["valid"] and s["trusted"] and s["entire_file"]
    rev_state, rev_entry = check_revocation(s.get("serials") or s.get("serial"),
                                            revocations, sealed_at=attested)

    print(f"issuer   {s['signer']}")
    print(f"seal     intact={s['intact']}  valid={s['valid']}  trusted={s['trusted']}  "
          f"entire_file={s['entire_file']}  ({kind})")
    print(f"checked  cert validity {moment}")
    print(f"anchor   {anchor}" + (f", attesting {attested}" if attested else ""))
    print(f"revoked  {rev_state}" + (f" ({rev_entry.get('reason')})" if rev_entry else ""))

    print()
    if rev_state == "revoked":
        signer_serial = str(s.get("serial") or "").lower().lstrip("0")
        matched = str(rev_entry.get("serial", "")).lower().lstrip("0")
        which = ("The signing certificate" if matched == signer_serial
                 else f"A certificate in the chain, {rev_entry.get('subject', matched)},")
        print(f"RESULT   UNRECOGNISED. {which} is revoked "
              f"({rev_entry.get('reason')}), so authenticity is not established.")
        sys.exit(1)

    if authentic:
        bits = []
        if anchor == "confirmed":
            bits.append("anchored to the public ledger")
        elif anchor == "pending":
            bits.append("anchor pending")
        if rev_state == "unchecked":
            bits.append("revocation unchecked")
        tail = (" " + ", ".join(bits).capitalize() + ".") if bits else ""
        print(f"RESULT   AUTHENTIC. Sealed, unaltered, and chaining to the pinned root.{tail}")
        sys.exit(0)

    if not s["intact"]:
        print("RESULT   ALTERED. The bytes differ from the bytes that were sealed.")
    elif not s["valid"]:
        print("RESULT   ALTERED. The signature does not verify.")
    elif not s["entire_file"]:
        print(f"RESULT   ALTERED. The seal covers {kind} rather than the entire file, "
              "so content was added after sealing.")
    else:
        print("RESULT   UNRECOGNISED. The signature is valid over these bytes, and its certificate "
              "chains elsewhere than the pinned root, so authenticity is not established.")
    sys.exit(1)


if __name__ == "__main__":
    main()
