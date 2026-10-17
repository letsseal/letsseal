"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${title}`}
        className="group block w-full overflow-hidden rounded-lg border text-left transition-colors outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <div className="relative bg-muted">
          {failed ? (
            <div className="flex h-56 items-center justify-center text-muted-foreground">
              <FileText className="size-6" />
            </div>
          ) : (
            <canvas ref={canvasRef} className="block w-full" />
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium shadow-sm">
              <Eye className="size-3.5" /> View
            </span>
          </span>
        </div>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {pages != null ? `${pages} page${pages === 1 ? "" : "s"}` : "PDF"}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-4rem)] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-3xl"
        >
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</DialogTitle>
            <Button asChild size="sm" variant="outline">
              <a href={downloadUrl ?? fileUrl} target="_blank" rel="noopener noreferrer">
                <Download /> Download
              </a>
            </Button>
            <DialogClose asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Close">
                <X />
              </Button>
            </DialogClose>
          </header>
          <div className="min-h-0 flex-1 overflow-auto bg-muted p-4">
            <PdfCanvas fileUrl={fileUrl} fields={[]} mode="view" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
