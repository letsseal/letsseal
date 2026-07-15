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
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -CAcreateserial \
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
  openssl ecparam -name prime256v1 -genkey -noout -out "$dir/$base.key"
  openssl req -new -key "$dir/$base.key" -out "$dir/$base.csr" -subj "/CN=$subject/O=$subject/C=GB"
  openssl x509 -req -in "$dir/$base.csr" \
    -CA "$OUT/intermediate.crt" -CAkey "$OUT/intermediate.key" -CAcreateserial \
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
    -CA "$OUT/root-ca.crt" -CAkey "$OUT/root-ca.key" -CAcreateserial \
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

# A business is just a 'document' cert stored under orgs/.
issue_org() { issue_cert "$1" "$2" document orgs signing ; }

# A business's code-signing cert (EKU codeSigning) for the supply-chain lane —
# cosign requires this EKU, so it lives beside the document cert as signing-code.p12.
# The SAN is the org's stable Let's Seal namespace URI — cosign's --certificate-identity.
issue_org_code() { issue_cert "$1" "$2" code orgs signing-code "URI:https://letsseal.org/o/$1" ; }

cmd="${1:-}"
case "$cmd" in
  init)         init_ca ;;
  identity-init) identity_init ;;
  org)       issue_org "${2:?slug required}" "${3:?legal name required}" ;;
  org-code)  issue_org_code "${2:?slug required}" "${3:?legal name required}" ;;
  cert)      issue_cert "${2:?id required}" "${3:?subject required}" "${4:-document}" certs ;;
  sign-csr)  sign_csr "${2:?id required}" "${3:?csr path required}" "${4:-document}" "${5:-$2}" certs ;;
  *) echo "Usage: $0 init | identity-init | org <slug> \"Legal Name\" | org-code <slug> \"Legal Name\" | cert <id> \"<subject>\" <document|code|data> | sign-csr <id> <csr> <profile> [pinned-cn]" >&2 ; exit 1 ;;
esac
