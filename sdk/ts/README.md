# @letsseal/sdk

TypeScript client for the [Let's Seal](https://letsseal.org) signing service —
PAdES sealing, verification, and free Bitcoin anchoring.

**Isomorphic, zero-dependency.** Uses the platform `fetch`, `Blob`, and
`crypto.subtle`, so it runs on Node 18+, Bun, Deno, Cloudflare Workers, and modern
browsers with no build-time deps.

```bash
npm install @letsseal/sdk
```

```ts
import { LetsSeal } from "@letsseal/sdk";

const ls = new LetsSeal({ baseUrl: "http://127.0.0.1:8081" });

// Seal a PDF with a business certificate
const { pdf, sha256, certCn } = await ls.seal(pdfBytes, { org: "acme" });

// Verify — chains to the Let's Seal CA
const v = await ls.verify(pdf);      // { sealed, intact, valid, trusted, signer, sha256 }

// Anchor privately: hash locally, only the 32-byte digest leaves the machine
const proof = await ls.anchorLocal(pdfBytes);  // { otsB64, status, sha256 }

// Or anchor a digest you already have
await ls.anchorHash("9f86d0…");

// CA-as-code: sign a CSR (you keep the private key)
await ls.signCsr({ id: "ci", csr: pemCsr, profile: "code" });
```

`FileInput` accepts a `Uint8Array`, `ArrayBuffer`, `Blob`, or `{ bytes, name }`.
Non-2xx responses throw `LetsSealError` (`.status`, `.body`).

**Trust is self-anchored.** The Let's Seal CA is deliberately not in OS/Adobe trust
stores; verify via the chain + the public portal + the blockchain. `trusted: true`
from `verify()` means it chains to *this* CA, not to a vendor trust list.

## Build

```bash
npm install && npm run build   # -> dist/
```

MIT.
