"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileUp, Copy, ExternalLink, Download, Check, X, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Status = "queued" | "sealing" | "sealed" | "error";
type Item = {
  file: File; name: string; size: number; status: Status;
  sha256?: string; proofUrl?: string; anchorState?: string; blobUrl?: string; error?: string;
};

const CONCURRENCY = 3;
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1e6 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1e6).toFixed(1)} MB`);

export default function BulkSealer({ slug }: { slug: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [anchor, setAnchor] = useState(true);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const pdfs = [...files].filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const skipped = files.length - pdfs.length;
    if (skipped) toast.error(`${skipped} non-PDF file(s) skipped`);
    setItems((prev) => [...prev, ...pdfs.map((f) => ({ file: f, name: f.name, size: f.size, status: "queued" as Status }))]);
  }

  async function sealOne(idx: number) {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, status: "sealing" } : it)));
    const it = itemsRef.current[idx];
    try {
      const form = new FormData();
      form.append("file", it.file, it.name);
      form.append("anchor", String(anchor));
      const res = await fetch(`/api/orgs/${slug}/seal`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const update: Partial<Item> = {
        status: "sealed",
        sha256: res.headers.get("x-letsseal-sha256") ?? undefined,
        proofUrl: res.headers.get("x-letsseal-proof-url") ?? undefined,
        anchorState: res.headers.get("x-letsseal-anchor-state") ?? undefined,
        blobUrl: URL.createObjectURL(blob),
      };
      setItems((p) => p.map((x, i) => (i === idx ? { ...x, ...update } : x)));
    } catch (e) {
      setItems((p) => p.map((x, i) => (i === idx ? { ...x, status: "error", error: String((e as Error).message ?? e) } : x)));
    }
  }

  // keep a live ref to items so the worker pool reads current File objects
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  async function sealAll() {
    const queued = items.map((it, i) => (it.status === "queued" || it.status === "error" ? i : -1)).filter((i) => i >= 0);
    if (queued.length === 0) { toast.error("No files to seal"); return; }
    setRunning(true);
    let cursor = 0;
    async function worker() {
      while (cursor < queued.length) {
        const idx = queued[cursor++];
        await sealOne(idx);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queued.length) }, worker));
    setRunning(false);
    const done = itemsRef.current.filter((x) => x.status === "sealed").length;
    toast.success(`Sealed ${done} document(s)`);
  }

  function downloadManifest() {
    const rows = [["file", "sha256", "proof_url", "anchor"]].concat(
      items.filter((i) => i.status === "sealed").map((i) => [i.name, i.sha256 ?? "", i.proofUrl ?? "", i.anchorState ?? ""]),
    );
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sealed-manifest.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const sealedCount = items.filter((i) => i.status === "sealed").length;

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 text-center transition-colors hover:border-brand/50 hover:bg-muted/30"
      >
        <FileUp className="mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">Drop PDFs here, or click to choose</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Invoices, statements, reports — anything you already generate. Sealed as this business.</p>
        <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={anchor} onChange={(e) => setAnchor(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Anchor to a public ledger (permanent proof of date)
        </label>
        <div className="ml-auto flex items-center gap-2">
          {sealedCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadManifest}>
              <Download className="h-4 w-4" /> Manifest (CSV)
            </Button>
          )}
          <Button onClick={sealAll} disabled={running || items.length === 0} className="gap-1.5">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Seal {items.filter((i) => i.status === "queued" || i.status === "error").length || ""} document{items.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="divide-y rounded-lg border">
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{it.name}</span>
                  <StatusBadge it={it} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {fmtSize(it.size)}
                  {it.error && <span className="text-red-600"> · {it.error}</span>}
                  {it.status === "sealed" && it.sha256 && <span className="font-mono"> · {it.sha256.slice(0, 12)}…</span>}
                </div>
              </div>
              {it.status === "sealed" && (
                <div className="flex shrink-0 items-center gap-1">
                  {it.proofUrl && (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Copy proof link"
                              onClick={() => { navigator.clipboard.writeText(it.proofUrl!); toast.success("Proof link copied"); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Open proof"><a href={it.proofUrl} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                    </>
                  )}
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Download sealed PDF">
                    <a href={it.blobUrl} download={it.name.replace(/\.pdf$/i, "") + ".sealed.pdf"}><Download className="h-3.5 w-3.5" /></a>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ it }: { it: Item }) {
  if (it.status === "queued") return <Badge variant="secondary" className="text-[10px]">Queued</Badge>;
  if (it.status === "sealing") return <Badge variant="secondary" className="gap-1 text-[10px]"><Loader2 className="h-2.5 w-2.5 animate-spin" />Sealing</Badge>;
  if (it.status === "error") return <Badge variant="destructive" className="gap-1 text-[10px]"><X className="h-2.5 w-2.5" />Failed</Badge>;
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] text-emerald-700">
      <Check className="h-2.5 w-2.5" />Sealed{it.anchorState && it.anchorState !== "none" ? (it.anchorState === "confirmed" ? "" : " · anchoring") : ""}
    </Badge>
  );
}
