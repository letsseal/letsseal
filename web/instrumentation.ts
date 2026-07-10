export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __letssealAnchorTimer?: NodeJS.Timeout };
  if (g.__letssealAnchorTimer) return; 

  const run = async () => {
    try {
      const { upgradePendingAnchors } = await import("@/lib/anchors");
      const r = await upgradePendingAnchors();
      if (r.confirmed) console.log(`[anchors] confirmed ${r.confirmed}/${r.checked} pending`);
    } catch (e) {
      console.error("[anchors] upgrade run failed:", e);
    }
  };

  g.__letssealAnchorTimer = setInterval(run, 30 * 60 * 1000);
  setTimeout(run, 15_000); // first pass shortly after boot
}
