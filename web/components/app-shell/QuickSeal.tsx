"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload, Loader2, ShieldCheck, ArrowUpRight, AlertCircle, Download } from "lucide-react";

type Result = { sha: string; name: string; url: string; sealedName: string } | null;

export function QuickSeal({ slug }: { slug: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(true);
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  async function seal(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setState("error"); setError("Please choose a PDF."); return;
    }
    setState("busy"); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("stamp", String(stampRef.current));
      const res = await fetch(`/api/orgs/${slug}/seal`, { method: "POST", body });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `seal failed (${res.status})`);
      }
      const sha = res.headers.get("X-Letsseal-Sha256") || "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const sealedName = `${file.name.replace(/\.pdf$/i, "")}.sealed.pdf`;
      setResult((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return { sha, name: file.name, url, sealedName }; });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "seal failed");
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="text-[15px] font-semibold">Seal something now</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Drop a PDF to seal &amp; anchor it — a public proof link, in one step.
      </p>

      {state === "done" && result ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
            <ShieldCheck className="h-4 w-4" /> Sealed &amp; anchoring
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{result.name}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            Your <b>sealed copy</b> is the new original — download it and use it in place of the file you uploaded. It carries the seal and matches the public proof.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={result.url} download={result.sealedName}
               className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">
              <Download className="h-3.5 w-3.5" /> Download sealed PDF
            </a>
            <Link href={`/d/${result.sha}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
              View proof <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <button onClick={() => { if (result.url) URL.revokeObjectURL(result.url); setState("idle"); setResult(null); }} className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Seal another
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) seal(f); }}
            disabled={state === "busy"}
            className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              drag ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-secondary/50"
            } ${state === "busy" ? "opacity-70" : ""}`}
          >
            {state === "busy" ? (
              <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Sealing…</span></>
            ) : (
              <><Upload className="h-6 w-6 text-primary" /><span className="text-sm text-muted-foreground">Drop a PDF, or click to choose</span></>
            )}
          </button>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-muted-foreground">
            <input
              type="checkbox"
              checked={stamp}
              onChange={(e) => setStamp(e.target.checked)}
              disabled={state === "busy"}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <span>Stamp a small <b className="font-medium text-foreground">verify QR badge</b> on the first page. Turn off when re-sealing someone else&apos;s document.</span>
          </label>
        </>
      )}

      {state === "error" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) seal(f); e.target.value = ""; }}
      />
    </div>
  );
}
