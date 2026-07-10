"""
providers.py — pluggable anchor backends.

An "anchor" commits a document's SHA-256 to an immutable, publicly-auditable,
*decentralized* ledger, producing a proof anyone can verify later WITHOUT
trusting Let's Seal.

Bitcoin (via OpenTimestamps) is the only live provider, and deliberately so — it
is the right ledger for this job:

  * free      — calendar servers batch millions of hashes into one transaction,
                so a proof costs the user nothing;
  * immutable — the hardest ledger in existence to rewrite (highest reorg cost);
  * durable   — the safest bet to still be verifiable in decades;
  * neutral   — no company, foundation, premine, or issuer to trust.

This seam exists as *insurance*, not as a "pick your favourite chain" switch:
because we keep every document's hash, a future ledger that is genuinely as
neutral and durable could be added here — or existing documents re-anchored —
without changing any caller. It is NOT an invitation to anchor to issuer-
controlled or permissioned ledgers (most proof-of-stake chains, stablecoin or
consortium/state coins): those reintroduce a trusted party and are unsuitable
for a trust product.

User-facing language should say what the anchor *does* ("independent,
decentralized timestamp — verifiable forever, no company in the middle"), and
name the underlying ledger only in the technical detail.
"""
from __future__ import annotations

import os

import anchor


class BitcoinProvider:
    """Bitcoin proof-of-existence via the OpenTimestamps calendar network."""

    id = "bitcoin"
    ledger = "Bitcoin"
    display_name = "Independent decentralized timestamp"
    note = "Anchored to a public decentralized ledger. Let's Seal holds no cryptocurrency and you never touch a coin or wallet."

    def stamp_digest(self, hex_digest: str) -> dict:
        return self._tag(anchor.stamp_digest(hex_digest))

    def stamp(self, pdf_bytes: bytes) -> dict:
        return self._tag(anchor.stamp(pdf_bytes))

    def upgrade(self, proof_b64: str) -> dict:
        return self._tag(anchor.upgrade(proof_b64))

    def _tag(self, r: dict) -> dict:
        r.setdefault("status", {})["provider"] = self.id
        r["provider"] = self.id
        return r


PROVIDERS = {p.id: p for p in (BitcoinProvider(),)}
DEFAULT_PROVIDER = os.environ.get("LETSSEAL_ANCHOR_PROVIDER", "bitcoin")


def get_provider(provider_id: str | None = None) -> BitcoinProvider:
    pid = provider_id or DEFAULT_PROVIDER
    if pid not in PROVIDERS:
        raise KeyError(f"unknown anchor provider '{pid}' (available: {', '.join(PROVIDERS)})")
    return PROVIDERS[pid]
