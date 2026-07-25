
const EXPLORER_API = "https://mempool.space/api";
export const EXPLORER_BLOCK = (h: number | string) => `https://mempool.space/block/${h}`;

export type BlockInfo = { height: number; hash: string; time: string | null };

export async function getBlockInfo(height: number): Promise<BlockInfo | null> {
  try {
    const hashRes = await fetch(`${EXPLORER_API}/block-height/${height}`, {
      signal: AbortSignal.timeout(5000), next: { revalidate: 3600 },
    });
    if (!hashRes.ok) return null;
    const hash = (await hashRes.text()).trim();
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;

    let time: string | null = null;
    try {
      const blk = await fetch(`${EXPLORER_API}/block/${hash}`, {
        signal: AbortSignal.timeout(5000), next: { revalidate: 3600 },
      });
      if (blk.ok) {
        const j = await blk.json();
        if (typeof j.timestamp === "number") time = new Date(j.timestamp * 1000).toISOString();
      }
    } catch {  }

    return { height, hash, time };
  } catch {
    return null;
  }
}
