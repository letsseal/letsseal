import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";


async function unsubscribe(token: string): Promise<"ok" | "unknown" | "already"> {
  const signer = await db.signer.findUnique({
    where: { token },
    select: { id: true, name: true, email: true, envelopeId: true, remindersEnabled: true },
  });
  if (!signer) return "unknown";
  if (!signer.remindersEnabled) return "already";

  await db.signer.update({ where: { id: signer.id }, data: { remindersEnabled: false } });
  await appendAudit(signer.envelopeId, signer.id, "reminders_disabled", {
    details: `recipient unsubscribed:${signer.email ?? signer.name}`,
  });
  return "ok";
}

export async function POST(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return Response.json({ error: "missing token" }, { status: 400 });

  const body = await req.text().catch(() => "");
  const oneClick = /List-Unsubscribe=One-Click/i.test(body);
  const result = await unsubscribe(token);

  if (oneClick) return new Response(null, { status: 200 });
  return Response.json({ ok: result !== "unknown", status: result });
}

export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const safe = token.replace(/[^A-Za-z0-9_-]/g, "");
  const page = (body: string) => new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Reminders</title>
     <style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f8fafc;color:#0f172a}
     main{background:#fff;padding:32px;border-radius:12px;max-width:34rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
     button{background:#2563eb;color:#fff;border:0;padding:10px 18px;border-radius:8px;font-size:15px;cursor:pointer}
     p{color:#475569}</style><main>${body}</main>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

  if (!safe) return page("<h1>Reminders</h1><p>This link is missing its code.</p>");
  return page(
    `<h1>Stop reminder emails?</h1>
     <p>You will stop receiving reminders about this document. Your signing link
        keeps working, so you can still sign whenever you are ready.</p>
     <form method="post" action="/api/reminders/unsubscribe?token=${safe}">
       <button type="submit">Stop reminders</button>
     </form>`,
  );
}
