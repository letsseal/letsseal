"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Download, X, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import PdfCanvas from "@/components/PdfCanvas";

export default function EnvelopeDocPreview({
  fileUrl,
  title,
  downloadUrl,
}: {
  fileUrl: string;
  title: string;
  downloadUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 640 / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="w-full max-w-xl">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${title}`}
          className="group relative block w-full overflow-hidden rounded-lg border bg-white transition-colors hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
          {failed ? (
            <div className="flex h-56 items-center justify-center text-muted-foreground">
              <FileText className="h-8 w-8" />
            </div>
          ) : (
            <canvas ref={canvasRef} className="block w-full" />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1 text-xs font-semibold text-stone-900 shadow">
              <Eye className="h-3.5 w-3.5" /> View
            </span>
          </span>
        </button>
        <div className="mt-2">
          <div className="truncate text-sm font-medium">{title}</div>
          {pages != null && (
            <div className="text-xs text-muted-foreground">
              {pages} page{pages === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={downloadUrl ?? fileUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
              <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
              <PdfCanvas fileUrl={fileUrl} fields={[]} mode="view" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
