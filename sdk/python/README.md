# letsseal

Python client for the [Let's Seal](https://letsseal.org) signing service: seal
anything (PDFs, images, XML, email, any file, software artifacts), verify, and
anchor on Bitcoin for free.

**Zero-dependency** (standard library only). Python 3.8+.

```bash
pip install letsseal
```

```python
from letsseal import LetsSeal

ls = LetsSeal("http://127.0.0.1:8081")

# Seal a PDF with a business certificate
res = ls.seal("contract.pdf", org="acme")     # accepts a path or bytes
open("contract.sealed.pdf", "wb").write(res.pdf)
print(res.cert_cn, res.sha256)

# Verify: chains to the Let's Seal root
print(ls.verify(res.pdf))   # {'sealed': True, 'intact': True, 'valid': True, 'trusted': True, ...}

# Seal any other file, digest-only, so the bytes never leave the machine
ls.seal_detached_local("release.tar.gz", org="acme")   # detached CMS over its SHA-256

# Seal an image with embedded C2PA Content Credentials
img = ls.seal_c2pa("photo.jpg", org="acme")            # SealedFile(data, sha256, cert_cn, format)
open("photo.signed.jpg", "wb").write(img.data)

# Supply chain: sign an SBOM/SLSA attestation over an artifact digest
ls.attest(res.sha256, org="acme", predicate=sbom, predicate_type="spdxjson")

# Anchor privately: hash locally, only the digest leaves the machine
proof = ls.anchor_local("contract.pdf")        # AnchorResult(ots_b64, status)
print(proof.status.state)                      # 'pending' -> 'confirmed' once on-chain
```

Also: `seal_xml`, `seal_smime`, `seal_blob`, `seal_identity`, `identity_providers`.

File arguments accept a path (`str` / `os.PathLike`) or raw `bytes`. Non-2xx
responses raise `LetsSealError` (`.status`, `.body`).

**Trust is self-anchored.** The Let's Seal CA is deliberately not in OS/Adobe trust
stores; verify via the chain + the public portal + the blockchain. `trusted=True`
from `verify()` means it chains to *this* CA, not to a vendor trust list.

Apache-2.0.
