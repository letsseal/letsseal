#!/usr/bin/env bash
#
# setup-ca.sh — create the Let's Seal Certificate Authority and per-organization
# document-signing certificates.
#
# Trust model (read this):
#   - This builds YOUR OWN CA. Documents sealed with it are cryptographically
#     tamper-evident and just as secure as a paid CA. The ONLY thing a paid
#     AATL cert would add is Adobe Reader showing a green check automatically
#     for people who verify OUTSIDE your platform. Your verification portal is
#     the trust anchor instead (same model DocuSeal / DocuSign core use).
#
# Layout produced under ca/out/:
#   root-ca.key / root-ca.crt          the offline root (keep the key safe)
#   intermediate.key / intermediate.crt the online signing intermediate
#   chain.pem                          intermediate + root (embed in sealed PDFs)
#   orgs/<slug>/signing.key            per-business signing key
#   orgs/<slug>/signing.crt            per-business signing cert
#   orgs/<slug>/signing.p12            PKCS#12 bundle pyHanko loads
#
# Usage:
#   ./setup-ca.sh init                 # one-time: create root + intermediate
#   ./setup-ca.sh org <slug> "Legal Name"   # issue a signing cert for a business
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
DAYS_ROOT=7300      # 20y
DAYS_INT=3650       # 10y
DAYS_ORG=1825       # 5y
# The p12 wraps an org's signing key — never ship a default password. Fail closed
# if LETSSEAL_P12_PASS isn't set rather than silently using a guessable default.
if [[ -z "${LETSSEAL_P12_PASS:-}" ]]; then
  echo "ERROR: LETSSEAL_P12_PASS must be set (it protects the org signing keys). Refusing to use a default." >&2
  exit 1
fi
P12_PASS="$LETSSEAL_P12_PASS"

# A certificate serial with real entropy.
#
# -CAcreateserial (what this replaces) increments a counter in a .srl file, so serials are sequential
# and predictable. The CA/Browser Forum baseline requires at least 64 bits of
# entropy in a serial, because a predictable serial makes the certificate's
# to-be-signed bytes fully predictable to an attacker, which is the precondition
# for a chosen-prefix collision attack on the signature hash. 128 bits here, with
# the top bit cleared so the DER INTEGER is unambiguously positive.
_serial() {
  printf '0x00%s' "$(openssl rand -hex 15)"
}

init_ca() {
  mkdir -p "$OUT"
  if [[ -f "$OUT/root-ca.crt" ]]; then
    echo "Root CA already exists at $OUT/root-ca.crt — refusing to overwrite." >&2
    exit 1
  fi

  echo "==> Root CA"
  openssl ecparam -name prime256v1 -genkey -noout -out "$OUT/root-ca.key"
  openssl req -x509 -new -nodes -key "$OUT/root-ca.key" -sha256 -days "$DAYS_ROOT" \
    -out "$OUT/root-ca.crt" \
    -subj "/CN=Let's Seal Root CA/O=Let's Seal/C=GB" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

  echo "==> Intermediate CA"
  openssl ecparam -name prime256v1 -genkey -noout -out "$OUT/intermediate.key"
  openssl req -new -key "$OUT/intermediate.key" \
    -out "$OUT/intermediate.csr" \
    -subj "/CN=Let's Seal Intermediate CA/O=Let's Seal/C=GB"
  openssl x509 -req -in "$OUT/intermediate.csr" \
    -CA "$OUT/root-ca.crt" -CAkey "$OUT/root-ca.key" -set_serial "$(_serial)" \
    -out "$OUT/intermediate.crt" -days "$DAYS_INT" -sha256 \
    -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n")

  cat "$OUT/intermediate.crt" "$OUT/root-ca.crt" > "$OUT/chain.pem"
  rm -f "$OUT/intermediate.csr"
  echo "==> Done. Chain at $OUT/chain.pem"
  echo "    Keep root-ca.key OFFLINE. The service only needs the intermediate + org certs."
}

# Defensively reject DN metacharacters in any value we splice into an openssl
# -subj string, so a caller cannot inject extra RDNs (DN injection). The service
# validates upstream too; this is belt-and-braces at the CA boundary.
_reject_dn_meta() {
  case "$1" in
    *"/"*|*$'\n'*|*$'\r'*) echo "refusing subject with DN metacharacter" >&2 ; exit 1 ;;
  esac
}

# X.509 extension profile per signing use-case. Trust is self-anchored either
# way (our CA isn't in OS/Adobe trust stores) — verify via the portal + chain.
_profile_ext() {
  case "$1" in
    document) printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nextendedKeyUsage=1.3.6.1.5.5.7.3.4\n" ;;         # doc signing (emailProtection EKU)
    code)     printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\n" ;;                                # code / firmware signing
    data)     printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\n" ;;                                               # general data attestation
    identity) printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nextendedKeyUsage=1.3.6.1.5.5.7.3.4,codeSigning\n" ;;  # OIDC-verified person identity (email + code)
    *) return 1 ;;
  esac
}

# Sign a client-supplied CSR — the proper PKI flow: the caller holds the key,
# the CA only signs. Usage: sign-csr <id> <csr-path> <profile> <cn> [subdir]
#
# The subject is PINNED server-side (-subj with the service-controlled CN); the
# caller's CSR DN is NOT trusted/copied. EKUs come solely from the server-side
# profile below — openssl x509 -req does not copy CSR extensions (no
# -copy_extensions), so caller-requested EKUs are ignored by design.
sign_csr() {
  local id="$1" csr="$2" profile="${3:-document}" cn="${4:-$1}" subdir="${5:-certs}"
  [[ -f "$OUT/intermediate.crt" ]] || { echo "No intermediate CA. Run 'init' first." >&2 ; exit 1 ; }
  _reject_dn_meta "$cn"
  local ext ; ext="$(_profile_ext "$profile")" || { echo "unknown profile: $profile (document|code|data)" >&2 ; exit 1 ; }
  local dir="$OUT/$subdir/$id" ; mkdir -p "$dir"
  echo "==> Signing CSR '$id' (profile: $profile, pinned CN: $cn)"
  openssl x509 -req -in "$csr" -subj "/CN=$cn/O=Let's Seal/C=GB" \
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -set_serial "$(_serial)" \
    -out "$dir/signing.crt" -days "$DAYS_ORG" -sha256 \
    -extfile <(printf "%s" "$ext")
  echo "==> Wrote $dir/signing.crt"
}

# Server-generated cert (key + cert + p12 all created here). Used for our own
# hosted PDF signing, where the service holds the key.
issue_cert() {
  local id="$1" subject="$2" profile="${3:-document}" subdir="${4:-certs}" base="${5:-signing}" san="${6:-}"
  [[ -f "$OUT/intermediate.crt" ]] || { echo "No intermediate CA. Run 'init' first." >&2 ; exit 1 ; }
  _reject_dn_meta "$subject"
  local ext ; ext="$(_profile_ext "$profile")" || { echo "unknown profile: $profile (document|code|data)" >&2 ; exit 1 ; }
  # A subjectAltName identity is required for cosign interop (it matches
  # --certificate-identity against the SAN). Append it when the caller supplies one.
  # $(...) above strips the profile's trailing newline, so add the separator here.
  [[ -n "$san" ]] && ext="${ext}"$'\n'"subjectAltName=${san}"
  local dir="$OUT/$subdir/$id" ; mkdir -p "$dir"
  echo "==> Signing cert for '$subject' (id: $id, profile: $profile, file: $base.p12)"
  # Reuse an existing signing key if present so re-issuing a cert (e.g. to bind a
  # newly-verified domain SAN) keeps the org's key — and thus its identity —
  # stable. Only generate a fresh key on first issue.
  if [[ -f "$dir/$base.key" ]]; then
    echo "    (reusing existing key $dir/$base.key)"
  else
    openssl ecparam -name prime256v1 -genkey -noout -out "$dir/$base.key"
  fi
  # -utf8: treat the -subj bytes as UTF-8. Without it openssl reads them as Latin-1,
  # so a name with non-ASCII (e.g. a curly apostrophe) is double-encoded into the
  # cert's UTF8String and later renders as mojibake ("Let’s" → "Letâ€™s").
  openssl req -new -utf8 -key "$dir/$base.key" -out "$dir/$base.csr" -subj "/CN=$subject/O=$subject/C=GB"
  openssl x509 -req -in "$dir/$base.csr" \
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -set_serial "$(_serial)" \
    -out "$dir/$base.crt" -days "$DAYS_ORG" -sha256 \
    -extfile <(printf "%s" "$ext")
  openssl pkcs12 -export -out "$dir/$base.p12" \
    -inkey "$dir/$base.key" -in "$dir/$base.crt" \
    -certfile "$OUT/chain.pem" -passout "pass:$P12_PASS"
  rm -f "$dir/$base.csr"
  echo "==> Wrote $dir/$base.p12  (password: \$LETSSEAL_P12_PASS)"
}

# The dedicated identity-issuing intermediate for Phase 3 OIDC identity.
#
# Unlike the org certs (leaves signed OFFLINE by the main intermediate), identity
# certs are minted ON DEMAND by the online signing service after it verifies a
# Google/GitHub OIDC proof. That requires an issuing key to live on the box, so we
# isolate the blast radius: a SEPARATE intermediate under the root, path-limited
# (pathlen:0) and EKU-constrained to person/code signing, whose compromise cannot
# forge document/org certs. Short leaf lifetimes + logging every issuance to the
# transparency log make mis-issuance detectable. The root stays offline.
#
# Produces:
#   out/identity-ca.key / identity-ca.crt   the online identity intermediate
#   out/identity-chain.pem                  identity-ca + root (leaf chain tail)
#   out/certs/_identity/issuer.p12          key+cert the service loads (chain=root)
identity_init() {
  [[ -f "$OUT/root-ca.crt" ]] || { echo "No root CA. Run 'init' first." >&2 ; exit 1 ; }
  if [[ -f "$OUT/identity-ca.crt" ]]; then
    echo "Identity intermediate already exists at $OUT/identity-ca.crt — refusing to overwrite." >&2
    exit 1
  fi
  echo "==> Identity intermediate CA"
  openssl ecparam -name prime256v1 -genkey -noout -out "$OUT/identity-ca.key"
  openssl req -new -key "$OUT/identity-ca.key" \
    -out "$OUT/identity-ca.csr" \
    -subj "/CN=Let's Seal Identity CA/O=Let's Seal/C=GB"
  # pathlen:0 → it can only sign leaves. EKU (non-critical) constrains issued
  # identity to email/code so a leaked identity key can't mint TLS/other certs.
  openssl x509 -req -in "$OUT/identity-ca.csr" \
    -CA "$OUT/root-ca.crt" -CAkey "$OUT/root-ca.key" -set_serial "$(_serial)" \
    -out "$OUT/identity-ca.crt" -days "$DAYS_INT" -sha256 \
    -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nextendedKeyUsage=1.3.6.1.5.5.7.3.4,codeSigning\n")
  cat "$OUT/identity-ca.crt" "$OUT/root-ca.crt" > "$OUT/identity-chain.pem"
  local dir="$OUT/certs/_identity" ; mkdir -p "$dir"
  # The service loads this p12: identity-ca key+cert, with root as the extra cert
  # so the emitted leaf chain (leaf + identity-ca + root) is complete for verifiers.
  openssl pkcs12 -export -out "$dir/issuer.p12" \
    -inkey "$OUT/identity-ca.key" -in "$OUT/identity-ca.crt" \
    -certfile "$OUT/root-ca.crt" -passout "pass:$P12_PASS"
  rm -f "$OUT/identity-ca.csr"
  echo "==> Wrote $OUT/identity-ca.crt and $dir/issuer.p12"
  echo "    Keep root-ca.key OFFLINE. The service loads issuer.p12 to mint short-lived identity leaves."
}

# A business is just a 'document' cert stored under orgs/. Its SAN carries the
# org's stable Let's Seal namespace URI; a verified domain is added by reissue-org.
issue_org() { issue_cert "$1" "$2" document orgs signing "URI:https://letsseal.org/o/$1" ; }

# Re-issue an org's document signing cert, optionally binding a VERIFIED domain as
# a dNSName SAN (Phase 3: the machine-checkable issuer identity lives in the SAN,
# so the seal artifact itself proves domain control — not just our proof page).
# The org key is preserved (issue_cert reuses it). Absence of the DNS SAN is the
# unverified marker. Usage: reissue-org <slug> "Legal Name" [verified-domain]
reissue_org() {
  local slug="$1" legal="$2" domain="${3:-}"
  local san="URI:https://letsseal.org/o/$slug"
  if [[ -n "$domain" ]]; then
    # Defensive: only a-z0-9.- may reach the SAN string (the service validates too).
    case "$domain" in
      *[!a-z0-9.-]*|.*|*.) echo "refusing invalid domain SAN: $domain" >&2 ; exit 1 ;;
    esac
    san="${san},DNS:${domain}"
  fi
  issue_cert "$slug" "$legal" document orgs signing "$san"
}

# A business's code-signing cert (EKU codeSigning) for the supply-chain lane —
# cosign requires this EKU, so it lives beside the document cert as signing-code.p12.
# The SAN is the org's stable Let's Seal namespace URI — cosign's --certificate-identity.
issue_org_code() { issue_cert "$1" "$2" code orgs signing-code "URI:https://letsseal.org/o/$1" ; }

# ---------------------------------------------------------------------------
# Revocation.
#
# A CA that cannot withdraw a certificate is not finished. Before this, an org
# cert was valid for five years with no way to retract it: a leaked signing key,
# or an org suspended for impersonation, went on producing seals that verified as
# trusted forever, because the verifier ran with revocation checking off and no
# list was published anywhere.
#
# The list is out/revoked.json, read by signing-service/revocation.py and served
# publicly so anyone can check a proof without asking us. See that module for why
# the REASON matters: key_compromise invalidates every seal under the cert
# whatever its date, while an orderly retirement leaves earlier seals standing.
# ---------------------------------------------------------------------------
REVOKED="$OUT/revoked.json"
_REASONS="key_compromise ca_compromise superseded cessation_of_operation affiliation_changed privilege_withdrawn unspecified"

# revoke <path-to-cert> <reason> [note]
revoke_cert() {
  local cert="$1" reason="$2" note="${3:-}"
  [[ -f "$cert" ]] || { echo "No certificate at $cert" >&2 ; exit 1 ; }
  case " $_REASONS " in
    *" $reason "*) ;;
    *) echo "Unknown reason '$reason'. One of: $_REASONS" >&2 ; exit 1 ;;
  esac

  local serial subject now
  serial="$(openssl x509 -in "$cert" -noout -serial | cut -d= -f2 | tr 'A-Z' 'a-z')"
  subject="$(openssl x509 -in "$cert" -noout -subject | sed 's/^subject=//')"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  mkdir -p "$OUT"
  [[ -f "$REVOKED" ]] || printf '{"version":1,"revoked":[]}\n' > "$REVOKED"

  # python3 rather than shell string-mangling: this file feeds a trust decision,
  # so it has to be valid JSON every time, not usually.
  SERIAL="$serial" SUBJECT="$subject" REASON="$reason" NOTE="$note" NOW="$now" \
  python3 - "$REVOKED" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
with open(path) as f:
    doc = json.load(f)
serial = os.environ["SERIAL"]
doc.setdefault("revoked", [])
doc["revoked"] = [e for e in doc["revoked"] if str(e.get("serial", "")).lower() != serial]
doc["revoked"].append({
    "serial": serial,
    "subject": os.environ["SUBJECT"],
    "reason": os.environ["REASON"],
    "revoked_at": os.environ["NOW"],
    "note": os.environ["NOTE"],
})
doc["revoked"].sort(key=lambda e: e["revoked_at"])
doc["version"] = 1
doc["updated_at"] = os.environ["NOW"]
with open(path, "w") as f:
    json.dump(doc, f, indent=2, sort_keys=True)
    f.write("\n")
PYEOF

  echo "==> Revoked $subject"
  echo "    serial  $serial"
  echo "    reason  $reason"
  echo "    listed in $REVOKED (published at /revocations.json)"
  if [[ "$reason" == "key_compromise" || "$reason" == "ca_compromise" ]]; then
    echo "    NOTE: EVERY seal under this certificate is now untrusted, whatever its date."
  else
    echo "    NOTE: seals provably made before now (confirmed anchor) stay trusted."
  fi
}

# unrevoke <path-to-cert>   (mistaken entries only; never to undo a real compromise)
unrevoke_cert() {
  local cert="$1"
  [[ -f "$cert" ]] || { echo "No certificate at $cert" >&2 ; exit 1 ; }
  [[ -f "$REVOKED" ]] || { echo "Nothing is revoked." >&2 ; exit 1 ; }
  local serial
  serial="$(openssl x509 -in "$cert" -noout -serial | cut -d= -f2 | tr 'A-Z' 'a-z')"
  SERIAL="$serial" python3 - "$REVOKED" <<'PYEOF'
import json, os, sys
path = sys.argv[1]
with open(path) as f:
    doc = json.load(f)
before = len(doc.get("revoked", []))
doc["revoked"] = [e for e in doc.get("revoked", []) if str(e.get("serial", "")).lower() != os.environ["SERIAL"]]
with open(path, "w") as f:
    json.dump(doc, f, indent=2, sort_keys=True)
    f.write("\n")
print("    removed %d entry/entries" % (before - len(doc["revoked"])))
PYEOF
  echo "==> Un-revoked serial $serial"
}

list_revoked() {
  [[ -f "$REVOKED" ]] || { echo "Nothing revoked yet." ; return ; }
  REVOKED="$REVOKED" python3 - <<'PYEOF'
import json, os
doc = json.load(open(os.environ["REVOKED"]))
rows = doc.get("revoked", [])
if not rows:
    print("Nothing revoked yet.")
else:
    for e in rows:
        print("%s  %-24s %s  %s" % (e["revoked_at"], e["reason"], e["serial"], e.get("subject", "")))
PYEOF
}

cmd="${1:-}"
case "$cmd" in
  init)         init_ca ;;
  identity-init) identity_init ;;
  org)       issue_org "${2:?slug required}" "${3:?legal name required}" ;;
  reissue-org) reissue_org "${2:?slug required}" "${3:?legal name required}" "${4:-}" ;;
  org-code)  issue_org_code "${2:?slug required}" "${3:?legal name required}" ;;
  cert)      issue_cert "${2:?id required}" "${3:?subject required}" "${4:-document}" certs ;;
  sign-csr)  sign_csr "${2:?id required}" "${3:?csr path required}" "${4:-document}" "${5:-$2}" certs ;;
  revoke)    revoke_cert "${2:?certificate path required}" "${3:?reason required}" "${4:-}" ;;
  unrevoke)  unrevoke_cert "${2:?certificate path required}" ;;
  revoked)   list_revoked ;;
  *) echo "Usage: $0 init | identity-init | org <slug> \"Legal Name\" | reissue-org <slug> \"Legal Name\" [verified-domain] | org-code <slug> \"Legal Name\" | cert <id> \"<subject>\" <document|code|data> | sign-csr <id> <csr> <profile> [pinned-cn] | revoke <cert-path> <reason> [note] | unrevoke <cert-path> | revoked" >&2 ; exit 1 ;;
esac
