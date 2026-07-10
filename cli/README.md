# sealbot (Node)

**The `certbot` for document authenticity.** Timestamp any file on Bitcoin and prove it
existed, unaltered — one command, no account. For humans, backends, CI, and AI agents.

Three core verbs (hash-only, keyless, scriptable):

```bash
sealbot anchor release-v3.tar.gz            # timestamp ANY file -> writes .ots
sealbot anchor release-v3.tar.gz --publish  # ...and register a shareable public proof page
sealbot verify contract.sealed.pdf          # check a sealed PDF (exit 2 if tampered)
                                            #   or: verify release.tar.gz.ots  → refresh status
sealbot watch  /srv/invoices --once         # anchor every new/changed file in a folder
```

`anchor` hashes locally and sends only the 32-byte digest — the file never leaves the
machine. Without `--publish` nothing is registered anywhere; the local `.ots` is your proof.

### Advanced — keyed signing

Sealing a PDF as a business identity (X.509 / PAdES) is a separate, keyed concern — it needs
the signing service and a bearer token (`--token` / `SEALBOT_TOKEN`):

```bash
sealbot seal  contract.pdf --org acme                    # seal a PDF with your CA
sealbot issue --id ci --cn "My CI" --profile code        # get a signing cert (key stays local)
```

> **Migrating:** `notarize` is now `anchor --publish`; `upgrade <f>.ots` is now `verify <f>.ots`.
> The old verbs still run (with a one-line notice) so existing scripts keep working.

## `watch` — turn a folder into an always-on notary

Point `sealbot` at a directory and it anchors (or seals) every new or changed file,
skipping anything it has already recorded — the daemon form of the one-shot commands.

```bash
sealbot watch /srv/invoices                       # poll forever, anchor new/changed files
sealbot watch /srv/invoices --once                # single pass (cron-friendly)
sealbot watch /srv/contracts --mode seal --org acme   # seal PDFs as they land
sealbot watch ./release --mode publish --interval 30  # public proof page per artifact
```

- **Non-destructive by default.** `anchor` mode hashes each file locally (only the 32-byte
  digest leaves the machine) and writes a sibling `<file>.ots` — the original bytes are never
  touched. This is register-in-place: the proof lives beside the file, not baked into it.
- **Idempotent.** A `.sealbot-state.json` dotfile tracks size+mtime, so restarts and repeated
  `--once` runs never re-anchor unchanged files. Derived artifacts (`.ots`, `.sealed.pdf`) and
  dotfiles are skipped, so it never chases its own tail.
- **Append-only audit log.** Every action is a line in `.sealbot-manifest.jsonl`
  (`ts`, `file`, `sha256`, `mode`, `state`, `proof`).
- **Modes:** `anchor` (default, hash-only local `.ots`, any file) · `publish` (hash-only +
  public proof page) · `seal` (PDFs only, needs `--org` and the keyed service).

Run it under systemd/pm2 for a directory that's continuously notarised, or on a `--once` cron
tick. Each `.ots` still verifies against Bitcoin with stock `ots verify <file>` — zero reliance
on Let's Seal existing.

## Install

```bash
npm i -g sealbot          # or: node cli/sealbot.mjs <cmd>
```

Requires Node ≥ 18. Point it at a service with `--api <url>` or `SEALBOT_API`
(default `http://127.0.0.1:8081`).

## What it is (and isn't)

- **`anchor` works on any file.** Anchoring is just `timestamp(sha256(bytes))`, so the same
  command proves the existence-and-date of software releases, datasets, audit logs, evidence,
  model weights, backups — not only PDFs.
- **It packages, it doesn't invent.** The Bitcoin timestamping is [OpenTimestamps](https://opentimestamps.org);
  the seal is a standard X.509 / PAdES signature. `sealbot` wraps them with a CA, a friendly API,
  and public proof pages. Your `.ots` proof verifies against Bitcoin with `ots verify` and **zero
  reliance on Let's Seal existing.**
- **Trust is self-anchored.** Unlike a paid AATL cert, the CA here is *not* in OS/Adobe trust
  stores. Authenticity is established via the public verification portal + the blockchain — which
  is the entire point: no trust list to buy into.

## Exit codes

`verify` returns `0` when authentic and intact, `2` when unsealed or tampered — so it slots
straight into a CI gate:

```bash
sealbot verify build/report.sealed.pdf || exit 1
```

## Commands

**Core** — hash-only, keyless, agent-friendly:

| Command | Notes |
|---|---|
| `anchor <file> [--publish]` | hash-only; writes `<file>.ots`; `--publish` also registers a public proof page; any file |
| `verify <file>` | a sealed PDF → checks seal + integrity; an `.ots` → refreshes its Bitcoin confirmation |
| `watch <dir>` | continuously anchor / publish / seal new & changed files |

**Advanced** — keyed signing (needs the signing service + `--token` / `SEALBOT_TOKEN`):

| Command | Notes |
|---|---|
| `seal <file.pdf> --org <slug>` | seal a PDF as a business identity (X.509 / PAdES) |
| `issue --id <id> --cn "<subject>"` | get a signing cert; the key is generated and kept locally |

Deprecated aliases (still run, with a one-line notice): `notarize` → `anchor --publish`;
`upgrade <f>.ots` → `verify <f>.ots`.

MIT licensed.
