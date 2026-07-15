# Let's Seal SDKs

Client libraries for the Let's Seal signing service — seal anything (PDFs, images,
XML, email, any file, software artifacts), verify, and anchor on Bitcoin for free.

**The API is the product; the clients are cheap.** The whole contract lives in one
file — [`openapi.json`](./openapi.json) — and everything here is built from it. You
don't need an SDK at all to integrate: the [`sealbot` CLI](../cli-rs) (a 1.4 MB
static binary) or a five-line HTTP call will do. The SDKs are a convenience.

## What's here

| Path | What | How it's maintained |
|------|------|---------------------|
| [`ts/`](./ts) | **TypeScript** — hero SDK | Hand-crafted, isomorphic, zero-dep |
| [`python/`](./python) | **Python** — hero SDK | Hand-crafted, stdlib-only |
| [`generated/go`](./generated) | **Go** | Generated from `openapi.json` |
| [`generated/java`](./generated) | **Java / JVM** | Generated from `openapi.json` |
| [`generated/php`](./generated) | **PHP** | Generated from `openapi.json` |
| [`generated/ruby`](./generated) | **Ruby** | Generated from `openapi.json` |
| [`generated/csharp`](./generated) | **C# / .NET** | Generated from `openapi.json` |
| [`openapi.json`](./openapi.json) | the contract | Frozen from the service (`freeze.sh`) |
| [`API.md`](./API.md) | human-readable endpoint reference | |

The two hero SDKs (TS + Python) are hand-written because that's where the "give me
a nice `seal(pdf)` call" audience is. Everything else is **generated** — regenerate
it, don't hand-edit it. This mirrors how Let's Encrypt shipped certbot + the ACME
spec and let the ecosystem write the long tail of clients.

## Quickstart

### TypeScript (`@letsseal/sdk`)

```ts
import { LetsSeal } from "@letsseal/sdk";
const ls = new LetsSeal({ baseUrl: "http://127.0.0.1:8081" });

const { pdf, certCn } = await ls.seal(fileBytes, { org: "acme" });
const result = await ls.verify(pdf);          // { sealed, intact, valid, trusted, signer }

// Anchor privately — hashes locally, only the digest leaves the machine:
const proof = await ls.anchorLocal(fileBytes); // { otsB64, status, sha256 }
```

Runs on Node 18+, Bun, Deno, Cloudflare Workers, and browsers (platform `fetch` +
`crypto.subtle`, no dependencies).

### Python (`letsseal`)

```python
from letsseal import LetsSeal
ls = LetsSeal("http://127.0.0.1:8081")

res = ls.seal("contract.pdf", org="acme")
open("contract.sealed.pdf", "wb").write(res.pdf)
print(ls.verify(res.pdf))                      # {'sealed': True, 'trusted': True, ...}

proof = ls.anchor_local("contract.pdf")        # hashes locally, anchors the digest
```

Standard library only; Python 3.8+.

## Against a hosted deployment (`/api/v1`)

The SDKs and `openapi.json` describe the **local keyed service** (`http://127.0.0.1:8081`).
A deployed Let's Seal also exposes a **hosted, authenticated tier** at `…/api/v1`, where a
per-business **API key** (`sk_live_…`, minted in a business's Settings) replaces the local
trust boundary. Point any SDK at it with a base URL and a Bearer header:

```ts
const ls = new LetsSeal({
  baseUrl: "https://app.letsseal.org/api/v1",
  headers: { Authorization: "Bearer sk_live_…" },
});
```

Differences from the local contract on the hosted tier:
- **`seal`** derives the business from the key — no `org_slug` needed — and by default also
  anchors and returns a permanent proof URL (`X-Letsseal-Proof-Url`).
- **`verify`** is public and needs **no key** — third parties verify for free, forever.
- `GET /api/v1/documents/<sha256>` returns a document's proof as JSON (keyless).

## Regenerating

```bash
./freeze.sh      # re-pull openapi.json from a running service (LETSSEAL_API)
./generate.sh    # regenerate go / java / php / ruby / csharp from the spec
```

`generate.sh` pins `@openapitools/openapi-generator-cli` to **5.4.0** (the last
release that runs on Java 8) and down-converts the 3.1 spec to 3.0 via `to30.py`.
With a modern JDK (11+) you can bump the pin in `openapitools.json` to 7.x, feed
`openapi.json` directly (skip `to30.py`), and drop the flag swaps noted in the
script — you'll get newer client styling (Java `native` HttpClient, .NET 8, etc.).

Kotlin, Rust, and Swift generators are available from the same spec — add a line
to `generate.sh`.

## Trust model

Let's Seal is the open standard for sealing anything. Trust is **self-anchored**: a
proof verifies against the published root, the public transparency log, and the
Bitcoin ledger — everything a verifier needs travels with the proof itself. So
`trusted` means the seal chains to *this* root, and the clients report exactly that.
