"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dropzone } from "@/components/common/dropzone";

type Result = { sha: string; name: string; url: string; sealedName: string } | null;
type StampMode = "badge" | "line" | "none";

const STAMP_CHOICES: { id: StampMode; label: string; hint: string }[] = [
  { id: "badge", label: "QR badge", hint: "QR code and short code in the corner of page one." },
  { id: "line", label: "Footer line", hint: "One grey line at the foot of the last page." },
  { id: "none", label: "None", hint: "Page untouched. Verification works the same." },
];

export function QuickSeal({ slug }: { slug: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState<StampMode>("badge");
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  async function seal(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setState("error"); setError("Choose a PDF."); return;
    }
    setState("busy"); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("stamp", stampRef.current);
      const res = await fetch(`/api/orgs/${slug}/seal`, { method: "POST", body });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Sealing failed (${res.status})`);
      }
      const sha = res.headers.get("X-Letsseal-Sha256") || "";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const sealedName = `${file.name.replace(/\.pdf$/i, "")}.sealed.pdf`;
      setResult((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return { sha, name: file.name, url, sealedName }; });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sealing failed");
      setState("error");
    }
  }

  return (
    <Card size="sm" className="h-fit">
      <CardHeader>
        <CardTitle>Seal a PDF</CardTitle>
        <CardDescription>Get a sealed copy and a public proof link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "done" && result ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="font-medium">Sealed</p>
                <p className="truncate text-muted-foreground">{result.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The sealed copy is now the original. Use it in place of the file you uploaded.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={result.url} download={result.sealedName}><Download /> Download</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/d/${result.sha}`}>View proof <ArrowUpRight /></Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { if (result.url) URL.revokeObjectURL(result.url); setState("idle"); setResult(null); }}>
                Seal another
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Dropzone
              accept="application/pdf,.pdf"
              busy={state === "busy"}
              busyTitle="Sealing…"
              title="Drop a PDF, or click to choose"
              size="sm"
              onFiles={(f) => seal(f[0])}
            />
            <div className="space-y-1.5">
              <ToggleGroup
                type="single"
                value={stamp}
                onValueChange={(v) => v && setStamp(v as StampMode)}
                disabled={state === "busy"}
                className="w-full"
                aria-label="Stamp on the page"
              >
                {STAMP_CHOICES.map((c) => (
                  <ToggleGroupItem key={c.id} value={c.id} className="text-xs">{c.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">{STAMP_CHOICES.find((c) => c.id === stamp)?.hint}</p>
            </div>
          </>
        )}
        {state === "error" && (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        )}
      </CardContent>
    </Card>
  );
}
