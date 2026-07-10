# letsseal

Python client for the [Let's Seal](https://letsseal.org) signing service — PAdES
sealing, verification, and free Bitcoin anchoring.

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

# Verify — chains to the Let's Seal CA
print(ls.verify(res.pdf))   # {'sealed': True, 'intact': True, 'valid': True, 'trusted': True, ...}

# Anchor privately: hash locally, only the digest leaves the machine
proof = ls.anchor_local("contract.pdf")        # AnchorResult(ots_b64, status)
print(proof.status.state)                      # 'pending' -> 'confirmed' once on-chain

# CA-as-code: sign a CSR (you keep the private key)
cert = ls.sign_csr(id="ci", csr=pem_csr, profile="code")
```

File arguments accept a path (`str` / `os.PathLike`) or raw `bytes`. Non-2xx
responses raise `LetsSealError` (`.status`, `.body`).

**Trust is self-anchored.** The Let's Seal CA is deliberately not in OS/Adobe trust
stores; verify via the chain + the public portal + the blockchain. `trusted=True`
from `verify()` means it chains to *this* CA, not to a vendor trust list.

MIT.
