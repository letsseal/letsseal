"""
oidc.py — verify a third-party identity proof, so a seal can carry a
*provider-verified* identity without Let's Seal ever verifying identity itself.

This is the whole stance of the identity lane: we do not run KYC, we do not
check passports, we do not assert who anyone is. We *leverage* an existing
identity provider (Sign in with Google / Microsoft / Apple, or GitHub) that the
signer already trusts, verify that provider's cryptographic proof, and bind the
resulting email into a short-lived certificate our CA issues. The claim on the
seal is therefore "Google vouched that this signer controls alice@corp.com at
seal time" — a third-party attestation, never a Let's Seal identity assertion.

Two proof shapes:

  * OIDC ID token (Google / Microsoft / Apple / any standards OIDC provider):
    a signed JWT. `verify_oidc(provider, id_token)` fetches the provider's JWKS
    via its discovery document, verifies the signature, and pins the expected
    issuer + audience (our client id) before trusting a single claim.

  * GitHub OAuth (not full OIDC for user login): `verify_github(access_token)`
    calls the GitHub API with the token to read the primary *verified* email and
    account URL.

No new dependency: JWT/JWKS verification is implemented directly over
`cryptography` + `requests`, the way smime.py reuses the existing crypto stack.

Config is env-driven; a provider is only enabled when its client id is set. The
web tier runs the browser OAuth redirect (it holds the client secret); it then
hands the raw token here and THIS service re-verifies it, so a web-tier
compromise alone cannot forge an identity — a valid provider token is still
required.
"""
from __future__ import annotations

import base64
import json
import os
import threading
import time
from typing import Optional

import requests
from cryptography.hazmat.primitives.asymmetric import padding, ec, rsa
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.exceptions import InvalidSignature

_LEEWAY = 60
_HTTP_TIMEOUT = 6
_CACHE_TTL = 3600


class IdentityError(Exception):
    """A verification failure. The message is safe to log; do NOT echo it back to
    an anonymous caller verbatim (it can carry token/claim detail)."""


def _providers() -> dict:
    reg: dict[str, dict] = {}

    def add(pid: str, issuer: str, client_env: str, issuer_env: Optional[str] = None):
        client_id = os.environ.get(client_env, "").strip()
        iss = os.environ.get(issuer_env, "").strip() if issuer_env else issuer
        if client_id and iss:
            reg[pid] = {"issuer": iss, "client_id": client_id}

    add("google", "https://accounts.google.com", "OIDC_GOOGLE_CLIENT_ID")
    add("microsoft", "", "OIDC_MICROSOFT_CLIENT_ID", "OIDC_MICROSOFT_ISSUER")
    add("apple", "https://appleid.apple.com", "OIDC_APPLE_CLIENT_ID")
    add(os.environ.get("OIDC_EXTRA_PROVIDER", "extra").strip() or "extra",
        "", "OIDC_EXTRA_CLIENT_ID", "OIDC_EXTRA_ISSUER")
    return reg


def enabled_providers() -> list[str]:
    provs = list(_providers().keys())
    if os.environ.get("OIDC_GITHUB_ENABLED", "").strip().lower() in ("1", "true", "yes"):
        provs.append("github")
    return provs


_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def _cached_get_json(url: str) -> dict:
    now = time.time()
    with _cache_lock:
        hit = _cache.get(url)
        if hit and hit[0] > now:
            return hit[1]
    resp = requests.get(url, timeout=_HTTP_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    with _cache_lock:
        _cache[url] = (now + _CACHE_TTL, data)
    return data


def _b64url_decode(seg: str) -> bytes:
    pad = "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg + pad)


def _jwk_to_public_key(jwk: dict):
    """Build a cryptography public key from a JWK (RSA or EC)."""
    kty = jwk.get("kty")
    if kty == "RSA":
        n = int.from_bytes(_b64url_decode(jwk["n"]), "big")
        e = int.from_bytes(_b64url_decode(jwk["e"]), "big")
        return rsa.RSAPublicNumbers(e, n).public_key()
    if kty == "EC":
        curves = {"P-256": ec.SECP256R1(), "P-384": ec.SECP384R1(), "P-521": ec.SECP521R1()}
        crv = curves.get(jwk.get("crv"))
        if crv is None:
            raise IdentityError(f"unsupported EC curve {jwk.get('crv')}")
        x = int.from_bytes(_b64url_decode(jwk["x"]), "big")
        y = int.from_bytes(_b64url_decode(jwk["y"]), "big")
        return ec.EllipticCurvePublicNumbers(x, y, crv).public_key()
    raise IdentityError(f"unsupported JWK key type {kty}")


_ALGS = {
    "RS256": (hashes.SHA256(), False), "RS384": (hashes.SHA384(), False), "RS512": (hashes.SHA512(), False),
    "ES256": (hashes.SHA256(), True), "ES384": (hashes.SHA384(), True), "ES512": (hashes.SHA512(), True),
}


def _verify_jwt(token: str, jwks: dict, expected_iss: str, expected_aud: str) -> dict:
    """Verify a JWT's signature against the JWKS and validate core claims. Returns
    the decoded claims on success; raises IdentityError otherwise."""
    parts = token.split(".")
    if len(parts) != 3:
        raise IdentityError("malformed JWT")
    header = json.loads(_b64url_decode(parts[0]))
    payload = json.loads(_b64url_decode(parts[1]))
    sig = _b64url_decode(parts[2])

    alg = header.get("alg")
    if alg not in _ALGS:
        raise IdentityError(f"disallowed alg {alg!r}")
    hash_alg, is_ec = _ALGS[alg]

    kid = header.get("kid")
    keys = jwks.get("keys", [])
    if kid is not None:
        jwk = next((k for k in keys if k.get("kid") == kid), None)
    else:
        jwk = keys[0] if len(keys) == 1 else None
    if jwk is None:
        raise IdentityError("no matching JWKS key for token kid")
    pub = _jwk_to_public_key(jwk)

    signing_input = (parts[0] + "." + parts[1]).encode("ascii")
    try:
        if is_ec:
            n = len(sig) // 2
            r = int.from_bytes(sig[:n], "big")
            s = int.from_bytes(sig[n:], "big")
            pub.verify(encode_dss_signature(r, s), signing_input, ec.ECDSA(hash_alg))
        else:
            pub.verify(sig, signing_input, padding.PKCS1v15(), hash_alg)
    except InvalidSignature:
        raise IdentityError("token signature does not verify")

    if payload.get("iss") != expected_iss:
        raise IdentityError("issuer mismatch")
    aud = payload.get("aud")
    aud_ok = (aud == expected_aud) or (isinstance(aud, list) and expected_aud in aud)
    if not aud_ok:
        raise IdentityError("audience mismatch")
    now = time.time()
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or now > exp + _LEEWAY:
        raise IdentityError("token expired")
    nbf = payload.get("nbf")
    if isinstance(nbf, (int, float)) and now + _LEEWAY < nbf:
        raise IdentityError("token not yet valid")
    iat = payload.get("iat")
    if isinstance(iat, (int, float)) and now + _LEEWAY < iat:
        raise IdentityError("token issued in the future")
    return payload


def verify_oidc(provider: str, id_token: str) -> dict:
    """Verify an OIDC ID token from a configured provider. Returns
    {identity, email, provider, issuer, subject, name} where `identity` is the
    provider-verified email to bind into the cert SAN.

    Raises IdentityError on any failure, unknown/unconfigured provider, or an
    email the provider did not mark verified."""
    reg = _providers()
    cfg = reg.get(provider)
    if not cfg:
        raise IdentityError(f"provider {provider!r} not configured")
    issuer = cfg["issuer"]
    disco = _cached_get_json(issuer.rstrip("/") + "/.well-known/openid-configuration")
    jwks_uri = disco.get("jwks_uri")
    if not jwks_uri:
        raise IdentityError("provider discovery missing jwks_uri")
    jwks = _cached_get_json(jwks_uri)

    claims = _verify_jwt(id_token, jwks, issuer, cfg["client_id"])

    email = claims.get("email")
    if not email:
        raise IdentityError("token carries no email (request the 'email' scope)")
    ev = claims.get("email_verified")
    if ev not in (True, "true"):
        raise IdentityError("provider did not verify this email")
    return {
        "identity": str(email).lower(),
        "email": str(email).lower(),
        "provider": provider,
        "issuer": issuer,
        "subject": str(claims.get("sub", "")),
        "name": str(claims.get("name", "")),
    }


def verify_github(access_token: str) -> dict:
    """Verify a GitHub OAuth access token by calling the GitHub API for the user's
    primary *verified* email and account URL. GitHub user login is OAuth, not full
    OIDC, so there is no ID token to check — the token itself is the proof, and we
    exchange it for the verified identity at the source."""
    if not access_token or len(access_token) > 512:
        raise IdentityError("invalid github token")
    headers = {"Authorization": f"Bearer {access_token}",
               "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    try:
        u = requests.get("https://api.github.com/user", headers=headers, timeout=_HTTP_TIMEOUT)
        u.raise_for_status()
        user = u.json()
        e = requests.get("https://api.github.com/user/emails", headers=headers, timeout=_HTTP_TIMEOUT)
        e.raise_for_status()
        emails = e.json()
    except requests.RequestException as exc:
        raise IdentityError(f"github api error: {exc}")
    primary = next((x for x in emails if x.get("primary") and x.get("verified")), None)
    if primary is None:
        primary = next((x for x in emails if x.get("verified")), None)
    if primary is None:
        raise IdentityError("no verified github email")
    login = str(user.get("login", ""))
    return {
        "identity": str(primary["email"]).lower(),
        "email": str(primary["email"]).lower(),
        "provider": "github",
        "issuer": "https://github.com/login/oauth",
        "subject": str(user.get("id", "")),
        "name": str(user.get("name") or login),
        "account_url": f"https://github.com/{login}" if login else "",
    }
