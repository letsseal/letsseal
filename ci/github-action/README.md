# sealbot — the Let's Seal GitHub Action

The **certbot for your pipeline**. After a build, prove your artifacts:

- **`anchor`** — hash each artifact and timestamp it to Bitcoin. The file **never leaves the
  runner** (only its 32-byte SHA-256 is sent), so it's safe for large binaries and private code.
- **`seal`** — seal PDFs with your business certificate.
- **`verify`** — check sealed files and fail the build if any are tampered.

Every run writes proof URLs to the **job summary** and a `sealbot-manifest.json`. Zero
dependencies — pure Node 20, runs on any runner.

## Usage

Anchor release artifacts (release-integrity / supply-chain):

```yaml
- uses: letsseal/letsseal/ci/github-action@main
  with:
    mode: anchor
    files: |
      dist/**/*.tar.gz
      dist/**/*.whl
    app: https://app.letsseal.org
    token: ${{ secrets.LETSSEAL_API_KEY }}   # optional for anchor (public keyless works too)
```

Seal generated PDFs:

```yaml
- uses: letsseal/letsseal/ci/github-action@main
  with:
    mode: seal
    files: out/*.pdf
    app: https://app.letsseal.org
    token: ${{ secrets.LETSSEAL_API_KEY }}
    org: acme
```

Verify sealed documents and gate the build:

```yaml
- uses: letsseal/letsseal/ci/github-action@main
  with:
    mode: verify
    files: signed/*.pdf
    app: https://app.letsseal.org
    fail-on-tamper: true
```

## Inputs

| Input | Default | Notes |
|-------|---------|-------|
| `mode` | `anchor` | `anchor` \| `seal` \| `verify` |
| `files` | — | Newline/comma-separated; `*` and `**` globs supported |
| `app` | — | Your Let's Seal base URL |
| `token` | — | `sk_live_…`; required for `seal`, optional for `anchor` |
| `org` | — | Business slug (reserved; `seal` derives it from the key) |
| `output-dir` | — | Where sealed PDFs are written (`seal`) |
| `fail-on-tamper` | `true` | `verify` fails the job on any bad file |

## Outputs

- `manifest-path` — `sealbot-manifest.json` (files, hashes, proof URLs) — upload it as an artifact.
- `count` — number of files processed.

## Honesty

`anchor` proves a file **existed by a date and hasn't changed** (integrity + time), verifiable by
anyone against Bitcoin without trusting us. It does **not** prove who built it or that its contents
are correct. `seal`/`verify` add your business certificate (authenticity of issuer). This is the
same trust model as the rest of Let's Seal — self-anchored, no vendor trust list.

> This action mirrors the [`sealbot` CLI](../../cli-rs). Once signed release binaries are
> published, a binary-backed variant can drop in with no behaviour change.
