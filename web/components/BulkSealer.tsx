"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/common/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dropzone } from "@/components/common/dropzone";
import { CopyButton } from "@/components/common/copy-button";
import { StatusBadge, type StatusTone } from "@/components/common/status-badge";

type Status = "queued" | "sealing" | "sealed" | "error";
type Item = {
  file: File; name: string; size: number; status: Status;
  sha256?: string; proofUrl?: string; anchorState?: string; blobUrl?: string; error?: string;
};

const CONCURRENCY = 3;
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1e6 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1e6).toFixed(1)} MB`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const STATUS: Record<Status, { tone: StatusTone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  sealing: { tone: "warning", label: "Sealing" },
  sealed: { tone: "success", label: "Sealed" },
  error: { tone: "destructive", label: "Failed" },
};

export default function BulkSealer({ slug }: { slug: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [anchor, setAnchor] = useState(true);
  const [running, setRunning] = useState(false);

  function addFiles(files: File[]) {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const skipped = files.length - pdfs.length;
    if (skipped) toast.error(`Skipped ${plural(skipped, "file")} that ${skipped === 1 ? "isn't a PDF" : "aren't PDFs"}`);
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
        throw new Error(err.error ?? `Sealing failed (${res.status})`);
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
    toast.success(`Sealed ${plural(done, "document")}`);
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
  const pending = items.filter((i) => i.status === "queued" || i.status === "error").length;

  return (
    <div className="space-y-6">
      <Dropzone
        multiple
        accept="application/pdf,.pdf"
        title="Drop PDFs, or click to choose"
        onFiles={addFiles}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch id="anchor" checked={anchor} onCheckedChange={setAnchor} disabled={running} />
          <Label htmlFor="anchor" className="font-normal">Timestamp</Label>
          <InfoTip label="About timestamps">
            <p>Records when each file existed, independently of Let&apos;s Seal. It confirms within a few hours.</p>
          </InfoTip>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sealedCount > 0 && (
            <Button variant="outline" onClick={downloadManifest}>
              <Download /> Download CSV
            </Button>
          )}
          <Button onClick={sealAll} disabled={running || pending === 0}>
            {running && <Loader2 className="animate-spin" />}
            {pending > 0 ? `Seal ${plural(pending, "document")}` : "Seal documents"}
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => {
                const timestampPending = it.status === "sealed" && it.anchorState && it.anchorState !== "none" && it.anchorState !== "confirmed";
                return (
                  <TableRow key={i}>
                    <TableCell className="max-w-0 w-full">
                      <p className="truncate font-medium">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtSize(it.size)}
                        {timestampPending && " · Timestamp pending"}
                        {it.error && <span className="text-destructive"> · {it.error}</span>}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS[it.status].tone}>{STATUS[it.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      {it.status === "sealed" && (
                        <div className="flex justify-end gap-1">
                          {it.proofUrl && (
                            <>
                              <CopyButton value={it.proofUrl} variant="ghost" ariaLabel="Copy proof link" toastMessage="Proof link copied" />
                              <Button asChild size="icon-sm" variant="ghost">
                                <a href={it.proofUrl} target="_blank" rel="noreferrer" aria-label="Open proof"><ExternalLink /></a>
                              </Button>
                            </>
                          )}
                          <Button asChild size="icon-sm" variant="ghost">
                            <a href={it.blobUrl} download={it.name.replace(/\.pdf$/i, "") + ".sealed.pdf"} aria-label="Download sealed PDF"><Download /></a>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
