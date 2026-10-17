"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Contact, Download, ExternalLink, GripVertical, Lock, Pencil, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";
import { DetailList, DetailRow } from "@/components/common/detail-list";
import { CopyButton } from "@/components/common/copy-button";
import { EmptyState } from "@/components/common/empty-state";
import { recipientColor, reorder, roleMeta } from "@/lib/signers";
import { cn } from "@/lib/utils";
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
  signers: Signer[];
  activity: { who: string; label: string; at: string }[];
};

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Awaiting", tone: "warning" },
  completed: { label: "Sealed", tone: "success" },
  voided: { label: "Voided", tone: "destructive" },
};


export default function EnvelopeShare({ slug, envelope, signers, activity }: Props) {
  const [chasing, setChasing] = useState<Record<string, boolean>>(
    () => Object.fromEntries(signers.map((s) => [s.id, s.remindersEnabled])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

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

  const signedCount = signers.filter((s) => s.status === "signed").length;
  const st = STATUS[envelope.status] ?? STATUS.draft;
  const fileUrl = envelope.completed ? `/api/file/${envelope.id}?variant=sealed` : `/api/file/${envelope.id}`;

  return (
    <>
      <PageHeader
        title={envelope.title}
        description={
          <span className="flex items-center gap-2">
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
            {envelope.status !== "draft" && signers.length > 0 && `${signedCount} of ${signers.length} signed`}
          </span>
        }
        actions={envelope.status === "draft" ? (
          <Button asChild>
            <Link href={`/${slug}/new?envelope=${envelope.id}`}><Pencil /> Continue editing</Link>
          </Button>
        ) : envelope.completed && (
          <>
            <Button asChild variant="outline">
              <a href={`/d/${envelope.id}`} target="_blank"><ShieldCheck /> Proof</a>
            </Button>
            <Button asChild variant="outline">
              <a href={fileUrl} target="_blank"><Download /> Download</a>
            </Button>
          </>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0 space-y-8">
          {envelope.message && (
            <div className="rounded-lg border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Message to recipients</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{envelope.message}</p>
            </div>
          )}

          <section>
            <h2 className="mb-3 text-base font-semibold tracking-tight">Recipients</h2>
            {rows.length === 0 ? (
              <EmptyState icon={Users} title="No recipients yet" description="Add recipients and fields, then send." />
            ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((s, i) => {
                const path = `/sign/${s.token}`;
                const inPerson = !s.email;
                const signed = s.status === "signed";
                const declined = s.status === "declined";
                const open = !signed && !declined;
                const affiliation = [s.title, s.department].filter(Boolean).join(" · ");
                return (
                  <li
                    key={s.token}
                    onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragFrom !== null) moveRow(dragFrom, i);
                      setDragFrom(null); setDragOver(null);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 transition-colors",
                      dragOver === i && dragFrom !== null && dragFrom !== i && "bg-accent",
                      dragFrom === i && "opacity-50",
                    )}
                  >
                    {reorderable && (
                      locked(s) ? (
                        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground/50"
                              title="Already asked to sign, so their place in the order is fixed">
                          <Lock className="size-3.5" />
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          draggable
                          onDragStart={() => { setDragFrom(i); setDragOver(i); }}
                          onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") { e.preventDefault(); moveRow(i, i - 1); }
                            if (e.key === "ArrowDown") { e.preventDefault(); moveRow(i, i + 1); }
                          }}
                          title={envelope.sequential ? "Drag to change the signing order, or use the arrow keys" : "Drag to reorder"}
                          aria-label={`Reorder ${s.name}, position ${i + 1} of ${rows.length}`}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical />
                        </Button>
                      )
                    )}
                    {envelope.sequential && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                    <span className="size-2 shrink-0 rounded-full" style={{ background: recipientColor(i).solid }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        <Badge variant="outline">{roleMeta(s.role).label}</Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                        <span>{s.email || "Signs in person"}</span>
                        {affiliation && <span className="hidden sm:inline">· {affiliation}</span>}
                        <span className={cn(signed && "text-success", declined && "text-destructive")}>
                          · {s.statusLabel ?? "Waiting"}
                        </span>
                        {s.accessCode && <span>· Code <span className="font-mono text-foreground">{s.accessCode}</span></span>}
                        {s.remindersSent > 0 && open && (
                          <span>· Reminded {s.remindersSent === 1 ? "once" : `${s.remindersSent} times`}</span>
                        )}
                      </p>
                    </div>
                    {open && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!inPerson && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={saving === s.id}
                            onClick={() => toggleChasing(s.id, !chasing[s.id])}
                            title={chasing[s.id] ? "Reminders on" : "Reminders off"}
                            aria-label="Reminders"
                            aria-pressed={chasing[s.id]}
                            className={cn(chasing[s.id] && "text-foreground")}
                          >
                            {chasing[s.id] ? <Bell /> : <BellOff />}
                          </Button>
                        )}
                        {inPerson ? (
                          <>
                            <CopyButton value={`${origin}${path}`} toastMessage="Link copied" />
                            <Button asChild size="sm" variant="outline">
                              <a href={path}><Contact /> Hand device</a>
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild size="icon-sm" variant="ghost" aria-label="Open signing page">
                              <a href={path} target="_blank"><ExternalLink /></a>
                            </Button>
                            <CopyButton value={`${origin}${path}`} label="Copy link" toastMessage="Link copied, email it to them" />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </section>

          {activity.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold tracking-tight">Activity</h2>
              <ol className="ml-1 border-l">
                {activity.map((a, i) => (
                  <li key={i} className="relative flex items-baseline justify-between gap-4 pb-4 pl-5 last:pb-0">
                    <span className="absolute top-1.5 -left-1 size-2 rounded-full border bg-background" />
                    <p className="min-w-0 text-sm">
                      <span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.label}</span>
                    </p>
                    <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.at}</time>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Document ID
            <span className="truncate font-mono text-foreground">{envelope.id}</span>
            <CopyButton value={envelope.id} variant="ghost" size="icon-xs" toastMessage="Document ID copied" />
          </div>
        </div>

        <div className="space-y-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList>
                <DetailRow label="Created">{envelope.createdLabel}</DetailRow>
                {envelope.completedLabel ? (
                  <DetailRow label="Completed">{envelope.completedLabel}</DetailRow>
                ) : (
                  <DetailRow label="Signing order">{envelope.sequential ? "One at a time" : "Any order"}</DetailRow>
                )}
                {envelope.completed && envelope.anchorState !== "none" && (
                  <DetailRow label="Timestamp">
                    {envelope.anchorState === "confirmed" ? (
                      <a href={`https://mempool.space/block/${envelope.btcBlock}`} target="_blank"
                         className="inline-flex items-center gap-1 text-brand hover:underline">
                        Block {envelope.btcBlock} <ExternalLink className="size-3.5" />
                      </a>
                    ) : (
                      <span className="font-normal text-muted-foreground">Confirming, takes a few hours</span>
                    )}
                  </DetailRow>
                )}
              </DetailList>
            </CardContent>
          </Card>
          <EnvelopeDocPreview fileUrl={fileUrl} title={envelope.title} />
        </div>
      </div>
    </>
  );
}
