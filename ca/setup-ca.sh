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
    -CA "$OUT/root-ca.crt" -CAkey "$OUT/root-ca.key" -CAcreateserial \
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
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -CAcreateserial \
    -out "$dir/signing.crt" -days "$DAYS_ORG" -sha256 \
    -extfile <(printf "%s" "$ext")
  echo "==> Wrote $dir/signing.crt"
}

# Server-generated cert (key + cert + p12 all created here). Used for our own
# hosted PDF signing, where the service holds the key.
issue_cert() {
  local id="$1" subject="$2" profile="${3:-document}" subdir="${4:-certs}"
  [[ -f "$OUT/intermediate.crt" ]] || { echo "No intermediate CA. Run 'init' first." >&2 ; exit 1 ; }
  _reject_dn_meta "$subject"
  local ext ; ext="$(_profile_ext "$profile")" || { echo "unknown profile: $profile (document|code|data)" >&2 ; exit 1 ; }
  local dir="$OUT/$subdir/$id" ; mkdir -p "$dir"
  echo "==> Signing cert for '$subject' (id: $id, profile: $profile)"
  openssl ecparam -name prime256v1 -genkey -noout -out "$dir/signing.key"
  openssl req -new -key "$dir/signing.key" -out "$dir/signing.csr" -subj "/CN=$subject/O=$subject/C=GB"
  openssl x509 -req -in "$dir/signing.csr" \
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -CAcreateserial \
    -out "$dir/signing.crt" -days "$DAYS_ORG" -sha256 \
    -extfile <(printf "%s" "$ext")
  openssl pkcs12 -export -out "$dir/signing.p12" \
    -inkey "$dir/signing.key" -in "$dir/signing.crt" \
    -certfile "$OUT/chain.pem" -passout "pass:$P12_PASS"
  rm -f "$dir/signing.csr"
  echo "==> Wrote $dir/signing.p12  (password: \$LETSSEAL_P12_PASS)"
}

# A business is just a 'document' cert stored under orgs/.
issue_org() { issue_cert "$1" "$2" document orgs ; }

cmd="${1:-}"
case "$cmd" in
  init)     init_ca ;;
  org)      issue_org "${2:?slug required}" "${3:?legal name required}" ;;
  cert)     issue_cert "${2:?id required}" "${3:?subject required}" "${4:-document}" certs ;;
  sign-csr) sign_csr "${2:?id required}" "${3:?csr path required}" "${4:-document}" "${5:-$2}" certs ;;
  *) echo "Usage: $0 init | org <slug> \"Legal Name\" | cert <id> \"<subject>\" <document|code|data> | sign-csr <id> <csr> <profile> [pinned-cn]" >&2 ; exit 1 ;;
esac
