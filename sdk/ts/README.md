# @letsseal/sdk

TypeScript client for the [Let's Seal](https://letsseal.org) signing service —
seal anything (PDFs, images, XML, email, any file, software artifacts), verify,
and anchor on Bitcoin for free.

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

// Verify — chains to the Let's Seal root
const v = await ls.verify(pdf);      // { sealed, intact, valid, trusted, signer, sha256 }

// Seal any other file, digest-only — the bytes never leave the machine
await ls.sealDetachedLocal(anyBytes, "acme");     // detached CMS over its SHA-256

// Seal an image with embedded C2PA Content Credentials
const { image } = await ls.sealC2pa(jpegBytes, { org: "acme" });

// Supply chain: sign an SBOM/SLSA attestation over an artifact digest
await ls.attest({ sha256, org: "acme", predicate: sbom, predicateType: "spdxjson" });

// Anchor privately: hash locally, only the 32-byte digest leaves the machine
const proof = await ls.anchorLocal(pdfBytes);  // { otsB64, status, sha256 }

// CA-as-code: sign a CSR (you keep the private key)
await ls.signCsr({ id: "ci", csr: pemCsr, profile: "code" });
```

Also: `sealXml`, `sealSmime`, `sealBlob`, `sealIdentity`, `identityProviders`.

`FileInput` accepts a `Uint8Array`, `ArrayBuffer`, `Blob`, or `{ bytes, name }`.
Non-2xx responses throw `LetsSealError` (`.status`, `.body`).

**Trust is self-anchored.** The Let's Seal CA is deliberately not in OS/Adobe trust
stores; verify via the chain + the public portal + the blockchain. `trusted: true`
from `verify()` means it chains to *this* CA, not to a vendor trust list.

## Build

```bash
npm install && npm run build   # -> dist/
```

Apache-2.0.
