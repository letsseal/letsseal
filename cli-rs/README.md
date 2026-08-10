# sealbot (Rust)

The flagship **single static binary**: timestamp any file on Bitcoin and prove it existed,
unaltered. No Node, no Python, no runtime. ~1.5 MB, drop it into any CI or air-gapped box.

Three core verbs (hash-only, keyless, agent-friendly):

```bash
cargo build --release                       # -> target/release/sealbot
sealbot anchor release.tar.gz               # hash locally -> writes release.tar.gz.ots
sealbot anchor release.tar.gz --publish     # ...and register a shareable public proof page
sealbot verify contract.sealed.pdf          # exit 2 if tampered; or: verify release.tar.gz.ots
sealbot watch  /srv/invoices --once         # anchor every new/changed file in a folder
```

### Advanced, keyed signing (signing service + `--token` / `SEALBOT_TOKEN`)

```bash
sealbot seal  contract.pdf --org acme                 # seal a PDF with your CA
sealbot issue --id ci --cn "My CI" --profile code     # signing cert; key generated locally
```

- **Hash-only by default.** `anchor` sends only the 32-byte SHA-256, so your file never leaves
  the machine. Without `--publish` nothing is registered anywhere; the local `.ots` is your
  proof, and it validates with stock `ots verify <file>`.
- **`watch`** turns a folder into an always-on notary: anchor / publish / seal every new or
  changed file, idempotently (a `.sealbot-state.json` skips unchanged files; every action is a
  line in `.sealbot-manifest.jsonl`). Run it under systemd or on a `--once` cron tick.
- **`issue` keeps your key.** It generates the EC key + CSR locally (via `openssl`); the CA
  only signs the CSR. Profiles: `document | code | data`.
- **Config:** `--api`/`SEALBOT_API` (signing service), `--app`/`SEALBOT_APP` (hosted app),
  `--token`/`SEALBOT_TOKEN` (bearer for the keyed service).
- **Honesty:** composes OpenTimestamps + an X.509 CA; trust is self-anchored (verify via the
  portal + blockchain, not OS/Adobe trust stores).

> **Migrating:** `notarize` → `anchor --publish`; `upgrade <f>.ots` → `verify <f>.ots`. The old
> verbs still run (with a one-line notice) so existing scripts keep working.

This supersedes the Node reference client in `../cli`. Same verbs, same API, since the API is the
product; clients are cheap.
