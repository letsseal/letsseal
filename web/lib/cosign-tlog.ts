import { createHash } from "crypto";
import { leafHash, inclusionProof } from "@/lib/merkle";
import { appendRekorLeaf, treeSnapshot } from "@/lib/translog";
import { signCheckpoint, signSet, getLogKeyId } from "@/lib/signing";

export const LOG_HOST = "letsseal.org";
export const LOG_TREE_ID = "1193050959916656506";
export const LOG_ORIGIN = `${LOG_HOST} - ${LOG_TREE_ID}`;

const hexToB64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

function pemToDerB64(pem: string): string {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("no certificate in PEM");
  return m[1].replace(/\s+/g, "");
}

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

let _logKeyIdB64: string | null = null;
async function logKeyIdB64(): Promise<string> {
  if (_logKeyIdB64) return _logKeyIdB64;
  _logKeyIdB64 = (await getLogKeyId()).key_id_b64;
  return _logKeyIdB64;
}

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

async function buildTlogEntry(sha: string, canonicalBody: string, kind: string, sealType: string) {
  const bodyB64 = Buffer.from(canonicalBody).toString("base64");
  await appendRekorLeaf(sha, canonicalBody, sealType);
  const { rows, leaves, root } = await treeSnapshot();
  const wantHash = leafHash(Buffer.from(canonicalBody)).toString("hex");
  const pos = rows.findIndex((r) => r.leafHash === wantHash);
  if (pos < 0) throw new Error("just-appended leaf not found in tree");
  const treeSize = leaves.length;
  const rootHex = root.toString("hex");
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
