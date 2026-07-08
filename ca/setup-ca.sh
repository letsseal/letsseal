#!/usr/bin/env bash
#
# setup-ca.sh — create the docsigner Certificate Authority and per-organization
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
P12_PASS="${DOCSIGNER_P12_PASS:-changeit}"   # override in real use

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
    -subj "/CN=docsigner Root CA/O=docsigner/C=GB" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

  echo "==> Intermediate CA"
  openssl ecparam -name prime256v1 -genkey -noout -out "$OUT/intermediate.key"
  openssl req -new -key "$OUT/intermediate.key" \
    -out "$OUT/intermediate.csr" \
    -subj "/CN=docsigner Intermediate CA/O=docsigner/C=GB"
  openssl x509 -req -in "$OUT/intermediate.csr" \
    -CA "$OUT/root-ca.crt" -CAkey "$OUT/root-ca.key" -CAcreateserial \
    -out "$OUT/intermediate.crt" -days "$DAYS_INT" -sha256 \
    -extfile <(printf "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n")

  cat "$OUT/intermediate.crt" "$OUT/root-ca.crt" > "$OUT/chain.pem"
  rm -f "$OUT/intermediate.csr"
  echo "==> Done. Chain at $OUT/chain.pem"
  echo "    Keep root-ca.key OFFLINE. The service only needs the intermediate + org certs."
}

issue_org() {
  local slug="$1" ; local legal="$2"
  local dir="$OUT/orgs/$slug"
  if [[ ! -f "$OUT/intermediate.crt" ]]; then
    echo "No intermediate CA. Run './setup-ca.sh init' first." >&2 ; exit 1
  fi
  mkdir -p "$dir"
  echo "==> Signing cert for '$legal' (slug: $slug)"
  openssl ecparam -name prime256v1 -genkey -noout -out "$dir/signing.key"
  openssl req -new -key "$dir/signing.key" -out "$dir/signing.csr" \
    -subj "/CN=$legal/O=$legal/C=GB"
  # digitalSignature + nonRepudiation is what makes this a *document signing* cert.
  openssl x509 -req -in "$dir/signing.csr" \
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -CAcreateserial \
    -out "$dir/signing.crt" -days "$DAYS_ORG" -sha256 \
    -extfile <(printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nextendedKeyUsage=1.3.6.1.5.5.7.3.4\n")
  # Bundle for pyHanko: key + cert + chain.
  openssl pkcs12 -export -out "$dir/signing.p12" \
    -inkey "$dir/signing.key" -in "$dir/signing.crt" \
    -certfile "$OUT/chain.pem" -passout "pass:$P12_PASS"
  rm -f "$dir/signing.csr"
  echo "==> Wrote $dir/signing.p12  (password: \$DOCSIGNER_P12_PASS, default 'changeit')"
}

cmd="${1:-}"
case "$cmd" in
  init) init_ca ;;
  org)  issue_org "${2:?slug required}" "${3:?legal name required}" ;;
  *) echo "Usage: $0 init | org <slug> \"Legal Name\"" >&2 ; exit 1 ;;
esac
