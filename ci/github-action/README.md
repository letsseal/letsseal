# sealbot: the Let's Seal GitHub Action

The certbot for your pipeline. After a build, prove your artifacts:

- **`anchor`**: hash each artifact and timestamp it on the public ledger. The file **never leaves the
  runner** (only its 32-byte SHA-256 is sent), so it is safe for large binaries and private code.
- **`sign`**: a **cosign-compatible signature** over each artifact under your code-signing
  certificate, plus a **SLSA provenance attestation** built from the CI context (repo, commit,
  ref, workflow, run). Digest-only, so the artifact never leaves the runner. Downstream consumers
  verify with **stock cosign**, no Let's Seal software required.
- **`seal`**: seal PDFs with your business certificate.
- **`verify`**: check sealed files and fail the build if any are tampered.

Every run writes proof URLs to the **job summary** and a `sealbot-manifest.json`. Zero
dependencies, pure Node, runs on any runner.

## Anchor every push (zero-config)

Want a permanent, public timestamp on **every commit**, with no API key and no setup? Copy
[`example-anchor-on-push.yml`](./example-anchor-on-push.yml) to `.github/workflows/seal.yml`. On
each push it hashes your source archive and anchors that hash on the ledger. It is keyless and
digest-only, so it runs in any repository, public or private, on any account, and your code stays
on the runner:

```yaml
name: Seal
on:
  push:
jobs:
  anchor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Anchor this commit's source on the public ledger
        env:
          LETSSEAL_APP: ${{ vars.LETSSEAL_APP || 'https://app.letsseal.org' }}
        run: |
          set -euo pipefail
          digest=$(git archive --format=tar HEAD | sha256sum | awk '{print $1}')
          curl -fsS -X POST "$LETSSEAL_APP/api/anchor" \
            -H 'Content-Type: application/json' -d "{\"sha256\":\"$digest\"}"
```

For proof of the *issuer* and the *build*, sign and attest your release artifacts instead (below).

## Sign + attest every release

A ready-to-use release workflow is in
[`example-release-workflow.yml`](./example-release-workflow.yml): on every `v*` tag it signs and
attests your build artifacts and attaches the proofs to the GitHub Release. Setup is one repo
secret, `LETSSEAL_API_KEY`, an `sk_live_` key whose org holds a code-signing certificate. (With no
key it falls back to a keyless ledger timestamp via `mode: anchor`.)

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

Sign release artifacts (cosign signature + SLSA provenance, full supply-chain proof):

```yaml
- uses: letsseal/letsseal/ci/github-action@main
  with:
    mode: sign
    files: dist/**/*.tar.gz
    app: https://app.letsseal.org
    token: ${{ secrets.LETSSEAL_API_KEY }}   # key's org must have a code-signing cert
```

This writes, next to each artifact, `<file>.cosign.bundle` (the signature) and
`<file>.att.bundle` (the SLSA provenance). Both are tlog-native Sigstore bundles
backed by Let's Seal's own transparency log, so anyone verifies with stock cosign
against our trusted root, no `--insecure-ignore-tlog`:

```sh
TR=$(mktemp); curl -s https://app.letsseal.org/trusted_root.json > "$TR"

cosign verify-blob --bundle app.tar.gz.cosign.bundle \
  --trusted-root "$TR" --new-bundle-format \
  --certificate-identity https://letsseal.org/o/<your-org> \
  --certificate-oidc-issuer-regexp '.*' --insecure-ignore-sct app.tar.gz

cosign verify-blob-attestation --bundle app.tar.gz.att.bundle \
  --trusted-root "$TR" --new-bundle-format \
  --certificate-identity https://letsseal.org/o/<your-org> \
  --certificate-oidc-issuer-regexp '.*' --insecure-ignore-sct \
  --type https://slsa.dev/provenance/v1 app.tar.gz
```

(`--insecure-ignore-sct` stays because Let's Seal runs its own append-only Merkle
transparency log rather than a Certificate Transparency log; the transparency
guarantee comes from that log, whose signed root is anchored to the public ledger.)

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
| `mode` | `anchor` | `anchor` \| `sign` \| `seal` \| `verify` |
| `files` | required | Newline/comma-separated; `*` and `**` globs supported |
| `app` | required | Your Let's Seal base URL |
| `token` | (none) | `sk_live_…`; required for `sign` and `seal`, optional for `anchor` |
| `org` | (none) | Business slug (reserved; `seal` derives it from the key) |
| `output-dir` | (none) | Where outputs are written (sealed PDFs for `seal`; sidecars for `sign`) |
| `anchor` | `true` | `sign`: also anchor each digest to the public ledger + the transparency log |
| `attest` | `true` | `sign`: also emit a SLSA provenance attestation |
| `fail-on-tamper` | `true` | `verify` fails the job on any bad file |

## Outputs

- `manifest-path`: `sealbot-manifest.json` (files, hashes, proof URLs), upload it as an artifact.
- `count`: number of files processed.

## Honesty

`anchor` proves a file **existed by a date and is unchanged** (integrity and time), verifiable by
anyone against the public ledger. `sign` additionally binds your code-signing certificate (issuer
authenticity) and a SLSA provenance statement describing the build that produced the artifact; that
provenance is only as trustworthy as the CI that generated it. `seal` and `verify` add your business
certificate for PDFs. Same trust model as the rest of Let's Seal: self-anchored, with trust pinned
to a published root.

> This action mirrors the [`sealbot` CLI](../../cli-rs). Once signed release binaries are
> published, a binary-backed variant can drop in with the same behaviour.
