import { db } from "./db";

export type NetworkStats = {
  documentsSealed: number;   
  organizations: number;     
  standaloneTimestamps: number; 
  latestBlock: number | null;   
};

const EMPTY: NetworkStats = { documentsSealed: 0, organizations: 0, standaloneTimestamps: 0, latestBlock: null };

export async function getNetworkStats(): Promise<NetworkStats> {
  try {
    const [documentsSealed, organizations, standaloneTimestamps, docBlock, anchorBlock] = await Promise.all([
      db.sealedDocument.count(),
      db.organization.count(),
      db.anchor.count(),
      db.sealedDocument.findFirst({
        where: { anchorState: "confirmed", btcBlock: { not: null } },
        orderBy: { btcBlock: "desc" }, select: { btcBlock: true },
      }),
      db.anchor.findFirst({
        where: { anchorState: "confirmed", btcBlock: { not: null } },
        orderBy: { btcBlock: "desc" }, select: { btcBlock: true },
      }),
    ]);
    const latestBlock = Math.max(docBlock?.btcBlock ?? 0, anchorBlock?.btcBlock ?? 0) || null;
    return { documentsSealed, organizations, standaloneTimestamps, latestBlock };
  } catch {
    return EMPTY;
  }
}
