"use client";

import { useState } from "react";
import { Copy, ExternalLink, Contact, Check, Clock, ShieldCheck, Download, Anchor, Eye, Ban, ListOrdered, History, BellRing, BellOff, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recipientColor, reorder } from "@/lib/signers";
import EnvelopeDocPreview from "@/components/EnvelopeDocPreview";

type Signer = {
  id: string;
  name: string;
  email: string | null;
  kind: string;
  role: string;
  token: string;
  status: string;
  accessCode: string | null;
  order: number;
  title: string | null;
  department: string | null;
  statusLabel: string | null;
  remindersEnabled: boolean;
  remindersSent: number;
  invited: boolean;
};
type Props = {
  slug: string;
  envelope: {
    id: string;
    title: string;
    status: string;
    completed: boolean;
    anchorState: string;
    btcBlock: number | null;
    createdLabel: string;
    completedLabel: string | null;
    message: string | null;
    sequential: boolean;
  };
  org: { name: string; brandColor: string };
  signers: Signer[];
  activity: { who: string; label: string; at: string }[];
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-stone-100 text-stone-600" },
  sent: { label: "Awaiting signatures", cls: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed & sealed", cls: "bg-green-100 text-green-700" },
  voided: { label: "Voided", cls: "bg-red-100 text-red-700" },
};

const ROLE_LABEL: Record<string, string> = {
  in_person: "In person",
  kiosk: "Kiosk",
  cc: "Copied",
  viewer: "Viewer",
};

export default function EnvelopeShare({ slug, envelope, org, signers, activity }: Props) {
  const [chasing, setChasing] = useState<Record<string, boolean>>(
    () => Object.fromEntries(signers.map((s) => [s.id, s.remindersEnabled])),
  );
  const [saving, setSaving] = useState<string | null>(null);

  const toggleChasing = async (signerId: string, next: boolean) => {
    const previous = chasing[signerId];
    setChasing((c) => ({ ...c, [signerId]: next }));
    setSaving(signerId);
    try {
      const res = await fetch(`/api/envelopes/${envelope.id}/signers/${signerId}/reminders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindersEnabled: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(next ? "Reminders on for this recipient" : "Reminders off for this recipient");
    } catch {
      setChasing((c) => ({ ...c, [signerId]: previous }));
      toast.error("Could not change reminders, please try again");
    } finally {
      setSaving(null);
    }
  };

  const [rows, setRows] = useState<Signer[]>(signers);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const orderIsHistory = envelope.sequential && envelope.status === "sent";
  const locked = (s: Signer) => orderIsHistory && (s.invited || s.status === "signed" || s.status === "declined");
  const reorderable = !envelope.completed && envelope.status !== "voided" && rows.length > 1;

  const moveRow = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    if (locked(rows[from])) { toast.error("This recipient has already been asked to sign"); return; }
    const next = reorder(rows, from, to);
    const lastLocked = next.reduce((last, s, i) => (locked(s) ? i : last), -1);
    if (next.some((s, i) => i < lastLocked && !locked(s))) {
      toast.error("Recipients already asked to sign stay in the order they were asked");
      return;
    }
    const previous = rows;
    setRows(next);
    try {
      const res = await fetch(`/api/envelopes/${envelope.id}/signers/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerIds: next.map((s) => s.id) }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string })?.error ?? "failed");
      toast.success(envelope.sequential ? "Signing order updated" : "Recipient order updated");
    } catch (e) {
      setRows(previous);
      toast.error(e instanceof Error && e.message !== "failed" ? e.message : "Could not reorder, please try again");
    }
  };

  const copyLink = (token: string, msg: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
    toast.success(msg);
  };
  const copyId = () => {
    navigator.clipboard.writeText(envelope.id);
    toast.success("Envelope ID copied");
  };

  const signedCount = signers.filter((s) => s.status === "signed").length;
  const st = STATUS_UI[envelope.status] ?? STATUS_UI.draft;
  const fileUrl = envelope.completed ? `/api/file/${envelope.id}?variant=sealed` : `/api/file/${envelope.id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-semibold text-white"
              style={{ background: org.brandColor }}>{org.name[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{envelope.title}</h1>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {org.name} · {signedCount} of {signers.length} signed
          </p>
        </div>
        {envelope.completed && (
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={`/d/${envelope.id}`} target="_blank"><ShieldCheck className="h-3.5 w-3.5" /> Public proof</a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={fileUrl} target="_blank"><Download className="h-3.5 w-3.5" /> PDF</a>
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-8">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-4">
              <Meta label="Status" value={st.label} />
              <Meta label="Created" value={envelope.createdLabel} />
              <Meta label={envelope.completedLabel ? "Completed" : "Signing order"}
                    value={envelope.completedLabel ?? (envelope.sequential ? "One at a time" : "Any order")} />
              <Meta label="Progress" value={`${signedCount} of ${signers.length} signed`} />
              <div className="col-span-2 border-t pt-3 sm:col-span-4">
                <div className="text-xs text-muted-foreground">Envelope ID</div>
                <button onClick={copyId} className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[13px] hover:text-primary">
                  {envelope.id} <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {envelope.completed && envelope.anchorState !== "none" && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Anchor className="h-3.5 w-3.5" />
                {envelope.anchorState === "confirmed"
                  ? <>Timestamped on the blockchain, block <b>{envelope.btcBlock}</b> · <a href={`https://mempool.space/block/${envelope.btcBlock}`} target="_blank" className="text-blue-600 hover:underline">explorer</a></>
                  : "Recording an independent timestamp, confirming (~a few hours)"}
              </div>
            )}

            {envelope.message && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message to recipients</div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-stone-700">{envelope.message}</p>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipients ({signers.length})</h2>
              {envelope.sequential && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ListOrdered className="h-3.5 w-3.5" /> signs in order
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {rows.map((s, i) => {
                const c = recipientColor(i);
                const path = `/sign/${s.token}`;
                const inPerson = !s.email;
                const signed = s.status === "signed";
                const declined = s.status === "declined";
                const viewed = s.status === "viewed";
                const roleLabel = ROLE_LABEL[s.kind] ?? (s.role === "cc" ? "Copied" : s.role === "viewer" ? "Viewer" : "Signer");
                return (
                  <div key={s.token}
                       onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                       onDrop={(e) => {
                         e.preventDefault();
                         if (dragFrom !== null) moveRow(dragFrom, i);
                         setDragFrom(null); setDragOver(null);
                       }}
                       className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 [&:not(:last-child)]:border-b ${
                         dragOver === i && dragFrom !== null && dragFrom !== i ? "bg-secondary/60" : ""
                       } ${dragFrom === i ? "opacity-50" : ""}`}>
                    {reorderable && (
                      locked(s) ? (
                        <span className="h-5 w-4 shrink-0" title="Already asked to sign, so their place in the order is fixed" />
                      ) : (
                        <button type="button"
                                draggable
                                onDragStart={() => { setDragFrom(i); setDragOver(i); }}
                                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === "ArrowUp") { e.preventDefault(); moveRow(i, i - 1); }
                                  if (e.key === "ArrowDown") { e.preventDefault(); moveRow(i, i + 1); }
                                }}
                                title={envelope.sequential ? "Drag to change the signing order, or use the arrow keys" : "Drag to reorder"}
                                aria-label={`Reorder ${s.name}, position ${i + 1} of ${rows.length}`}
                                className="shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing">
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                    {envelope.sequential && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                    )}
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.solid }} />
                    <span className="font-medium">{s.name}</span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">{roleLabel}</span>
                    <span className="text-sm text-muted-foreground">{s.email || "no email, sign in person"}</span>
                    {(s.title || s.department) && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">· {[s.title, s.department].filter(Boolean).join(" · ")}</span>
                    )}
                    {s.statusLabel && <span className="text-xs text-muted-foreground">· {s.statusLabel}</span>}
                    {s.accessCode && <span className="text-xs text-muted-foreground">· code <b>{s.accessCode}</b></span>}
                    {s.remindersSent > 0 && !signed && !declined && (
                      <span className="text-xs text-muted-foreground">
                        · chased {s.remindersSent === 1 ? "once" : `${s.remindersSent} times`}
                      </span>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="gap-1 font-normal">
                        {signed ? <><Check className="h-3 w-3 text-green-600" /> signed</>
                          : declined ? <><Ban className="h-3 w-3 text-red-600" /> declined</>
                          : viewed ? <><Eye className="h-3 w-3 text-blue-600" /> viewed</>
                          : <><Clock className="h-3 w-3" /> pending</>}
                      </Badge>
                      {!signed && !declined && !inPerson && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={saving === s.id}
                          onClick={() => toggleChasing(s.id, !chasing[s.id])}
                          title={chasing[s.id]
                            ? "Reminders on. Click to stop chasing this recipient."
                            : "Reminders off. Click to chase this recipient."}
                          aria-label={chasing[s.id] ? "Turn reminders off" : "Turn reminders on"}
                          aria-pressed={chasing[s.id]}
                        >
                          {chasing[s.id]
                            ? <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
                            : <BellOff className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        </Button>
                      )}
                      {!signed && !declined && (
                        inPerson ? (
                          <>
                            <Button asChild size="sm" className="gap-1.5 text-white" style={{ background: c.solid }}>
                              <a href={path}><Contact className="h-3.5 w-3.5" /> Hand device</a>
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copyLink(s.token, "Link copied")} aria-label="Copy link">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(s.token, "Link copied, email it to them")}>
                              <Copy className="h-3.5 w-3.5" /> Copy link
                            </Button>
                            <Button asChild size="icon" variant="outline" className="h-8 w-8" aria-label="Open signing page">
                              <a href={path} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></a>
                            </Button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activity.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Activity
              </h2>
              <ol className="overflow-hidden rounded-xl border bg-card">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5 [&:not(:last-child)]:border-b">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.label}</span>
                    </div>
                    <div className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.at}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document</h2>
          <EnvelopeDocPreview fileUrl={fileUrl} title={envelope.title} />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
