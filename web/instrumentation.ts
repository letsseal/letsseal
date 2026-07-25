export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await auditEnvironment();

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
  setTimeout(run, 15_000); 
}

async function auditEnvironment() {
  const production = process.env.NODE_ENV === "production";
  const fatal: string[] = [];
  const warn: string[] = [];

  if (!process.env.AUTH_SECRET?.trim()) {
    fatal.push("AUTH_SECRET is unset: sessions, the identity-seal flow cookie and the audit-chain HMAC all depend on it.");
  }
  if (!process.env.LETSSEAL_SERVICE_TOKEN?.trim()) {
    fatal.push("LETSSEAL_SERVICE_TOKEN is unset: every call to the signing service will be rejected.");
  }
  if (!process.env.APP_URL?.trim()) {
    warn.push("APP_URL is unset: proof links and email links will point at http://localhost:3000.");
  }
  if (!process.env.CRON_SECRET?.trim()) {
    warn.push("CRON_SECRET is unset: /api/anchors/upgrade will refuse every call, so anchors stay pending.");
  }
  if (!process.env.AUDIT_HMAC_SECRET?.trim()) {
    warn.push("AUDIT_HMAC_SECRET is unset: the audit chain falls back to AUTH_SECRET (works, but rotating one rotates the other).");
  }

  const { proxyPosture } = await import("@/lib/ip");
  const posture = proxyPosture();
  if (posture === "unset") {
    const msg =
      'TRUSTED_PROXY is not set. Every caller will resolve to the IP "local", so per-IP limits ' +
      "collapse into ONE shared bucket (one attacker's failed sign-ins lock out every user) and the " +
      "audit trail records no real signer IP. Set TRUSTED_PROXY=cloudflare | xrealip | xff to match " +
      'your reverse proxy, or TRUSTED_PROXY=none to confirm this origin is reached directly. See lib/ip.ts.';
    if (production) fatal.push(msg);
    else warn.push(msg);
  } else if (posture === "declared") {
    warn.push(
      'TRUSTED_PROXY=none: clients are treated as unidentifiable, so per-IP limits apply globally ' +
      "rather than per caller. Correct for a directly-reachable origin. If something does sit in " +
      "front of this app, name it instead so the limits and the audit trail see real addresses.",
    );
  }

  for (const w of warn) console.warn(`[preflight] WARNING: ${w}`);

  if (fatal.length) {
    for (const f of fatal) console.error(`[preflight] FATAL: ${f}`);
    if (production) {
      throw new Error(
        `[preflight] refusing to start: ${fatal.length} required setting(s) missing. ` +
        `Fix web/.env (see web/.env.example).`,
      );
    }
  }

  if (!fatal.length && !warn.length) console.log("[preflight] environment OK");
}
