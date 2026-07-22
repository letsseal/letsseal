import { createHash } from "crypto";
import { leafHash, merkleRoot, inclusionProof } from "@/lib/merkle";
import { appendRekorLeaf } from "@/lib/translog";
import { db } from "@/lib/db";
import { signCheckpoint, signSet, getLogKeyId } from "@/lib/signing";

export const LOG_HOST = "letsseal.org";
export const LOG_TREE_ID = "1193050959916656506";
export const LOG_ORIGIN = `${LOG_HOST} - ${LOG_TREE_ID}`;

const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64");
const hexToB64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

function pemToDerB64(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("no certificate in PEM");
  return m[1].replace(/\s+/g, "");
}

// Rekor hashedrekord v0.0.1 entry body — the Merkle-leaf preimage. This exact
// byte serialization is what we log AND what we base64 into canonicalizedBody, so
// cosign's leaf recomputation matches our tree. Field order is fixed on purpose.
export function hashedRekordBody(artifactSha256Hex: string, sigB64: string, leafCertPem: string): string {
  return JSON.stringify({
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: artifactSha256Hex } },
      signature: { content: sigB64, publicKey: { content: Buffer.from(leafCertPem).toString("base64") } },
    },
  });
}

// One log key ID for the process (static). Cached to avoid a signing-service round
// trip per seal.
let _logKeyIdB64: string | null = null;
async function logKeyIdB64(): Promise<string> {
  if (_logKeyIdB64) return _logKeyIdB64;
  _logKeyIdB64 = (await getLogKeyId()).key_id_b64;
  return _logKeyIdB64;
}

// Rekor dsse v0.0.1 entry body — the Merkle-leaf preimage for an attestation.
// `signature` is the base64(DER) DSSE signature (the same string the bundle's
// dsseEnvelope carries), `verifier` is base64(PEM) of the signer cert, and
// payloadHash binds the in-toto statement. cosign reads signature/verifier/
// payloadHash off this body; envelopeHash is required by the schema but unchecked.
export function dsseBody(sigB64: string, certPem: string, envelopeHashHex: string, payloadHashHex: string): string {
  return JSON.stringify({
    apiVersion: "0.0.1",
    kind: "dsse",
    spec: {
      signatures: [{ signature: sigB64, verifier: Buffer.from(certPem).toString("base64") }],
      envelopeHash: { algorithm: "sha256", value: envelopeHashHex },
      payloadHash: { algorithm: "sha256", value: payloadHashHex },
    },
  });
}

export type CosignBundle = Record<string, unknown>;

// Log a Rekor-entry body as a leaf, snapshot the tree once, and produce the signed
// tlogEntry (inclusion proof + checkpoint + SET) that both bundle shapes share.
// The leaf is appended first, then the tree read back so (root, proof) are
// consistent with the just-inserted leaf.
async function buildTlogEntry(sha: string, canonicalBody: string, kind: string, sealType: string) {
  const bodyB64 = Buffer.from(canonicalBody).toString("base64");
  await appendRekorLeaf(sha, canonicalBody, sealType);
  const rows = await db.logEntry.findMany({ orderBy: { idx: "asc" }, select: { idx: true, leafHash: true } });
  const leaves = rows.map((r) => Buffer.from(r.leafHash, "hex"));
  const wantHash = leafHash(Buffer.from(canonicalBody)).toString("hex");
  const pos = rows.findIndex((r) => r.leafHash === wantHash);
  if (pos < 0) throw new Error("just-appended leaf not found in tree");
  const treeSize = leaves.length;
  const rootHex = merkleRoot(leaves).toString("hex");
  const proof = inclusionProof(leaves, pos).map((x) => x.toString("hex"));

  const { envelope } = await signCheckpoint(LOG_ORIGIN, treeSize, rootHex);
  const integratedTime = Math.floor(Date.now() / 1000);
  const { set_b64 } = await signSet(bodyB64, integratedTime, pos);

  return {
    logIndex: String(pos),
    logId: { keyId: await logKeyIdB64() },
    kindVersion: { kind, version: "0.0.1" },
    integratedTime: String(integratedTime),
    inclusionPromise: { signedEntryTimestamp: set_b64 },
    inclusionProof: {
      logIndex: String(pos),
      rootHash: hexToB64(rootHex),
      treeSize: String(treeSize),
      hashes: proof.map(hexToB64),
      checkpoint: { envelope },
    },
    canonicalizedBody: bodyB64,
  };
}

// Build the v0.3 bundle for a blob seal. Digest-only: only the artifact's SHA-256,
// the signature and the cert are needed. Best-effort at the call site — a failure
// here must never fail the seal itself (the sidecar .sig/.pem still work).
export async function buildBlobCosignBundle(opts: {
  artifactSha256: string; sigB64: string; certPem: string;
}): Promise<CosignBundle> {
  const sha = opts.artifactSha256.trim().toLowerCase();
  const canonicalBody = hashedRekordBody(sha, opts.sigB64, opts.certPem);
  const tlogEntry = await buildTlogEntry(sha, canonicalBody, "hashedrekord", "blob");
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      certificate: { rawBytes: pemToDerB64(opts.certPem) },
      tlogEntries: [tlogEntry],
    },
    messageSignature: {
      messageDigest: { algorithm: "SHA2_256", digest: hexToB64(sha) },
      signature: opts.sigB64,
    },
  };
}

type DsseEnvelope = { payload: string; payloadType: string; signatures: { sig: string }[] };

// Build the v0.3 bundle for a DSSE/in-toto attestation, backed by our log. Takes
// the DSSE envelope the signing service produced (leaf-key signature over the PAE)
// plus the signer cert; assembles a `dsse` v0.0.1 Rekor entry so the bundle
// verifies with `cosign verify-blob-attestation --trusted-root <ours>` WITHOUT
// --insecure-ignore-tlog. Best-effort at the call site.
export async function buildAttestCosignBundle(opts: {
  artifactSha256: string; dsse: DsseEnvelope; certPem: string;
}): Promise<CosignBundle> {
  const sha = opts.artifactSha256.trim().toLowerCase();
  const env = opts.dsse;
  const sigB64 = env.signatures?.[0]?.sig;
  if (!sigB64) throw new Error("DSSE envelope has no signature");
  const payloadRaw = Buffer.from(env.payload, "base64");
  const payloadHashHex = createHash("sha256").update(payloadRaw).digest("hex");
  const envelopeHashHex = createHash("sha256").update(Buffer.from(JSON.stringify(env))).digest("hex");
  const canonicalBody = dsseBody(sigB64, opts.certPem, envelopeHashHex, payloadHashHex);
  const tlogEntry = await buildTlogEntry(sha, canonicalBody, "dsse", "attestation");
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      certificate: { rawBytes: pemToDerB64(opts.certPem) },
      tlogEntries: [tlogEntry],
    },
    dsseEnvelope: env,
  };
}
