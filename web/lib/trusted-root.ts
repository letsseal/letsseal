import { getLogCert, getLogKeyId } from "@/lib/signing";
import { LOG_HOST } from "@/lib/cosign-tlog";

function pemsToDerB64(pemBundle: string): string[] {
  const matches = pemBundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  return matches.map((pem) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
}

let _cached: Record<string, unknown> | null = null;

export async function buildTrustedRoot(): Promise<Record<string, unknown>> {
  if (_cached) return _cached;
  const [logCert, keyId] = await Promise.all([getLogCert(), getLogKeyId()]);
  const caCerts = pemsToDerB64(logCert.chain_pem);
  const tr = {
    mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    certificateAuthorities: [
      {
        subject: { organization: "Let's Seal", commonName: "Let's Seal" },
        uri: "https://letsseal.org",
        certChain: { certificates: caCerts.map((rawBytes) => ({ rawBytes })) },
        validFor: { start: "2020-01-01T00:00:00Z" },
      },
    ],
    tlogs: [
      {
        baseUrl: `https://${LOG_HOST}`,
        hashAlgorithm: "SHA2_256",
        publicKey: {
          rawBytes: keyId.spki_b64,
          keyDetails: "PKIX_ECDSA_P256_SHA_256",
          validFor: { start: "2020-01-01T00:00:00Z" },
        },
        logId: { keyId: keyId.key_id_b64 },
      },
    ],
    ctlogs: [],
    timestampAuthorities: [],
  };
  _cached = tr;
  return tr;
}
