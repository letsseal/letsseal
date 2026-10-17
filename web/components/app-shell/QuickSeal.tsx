"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dropzone } from "@/components/common/dropzone";
import { InfoTip } from "@/components/common/info-tip";

type Result = { sha: string; name: string; url: string; sealedName: string } | null;
type StampMode = "badge" | "line" | "none";

const STAMP_CHOICES: { id: StampMode; label: string }[] = [
  { id: "badge", label: "QR badge" },
  { id: "line", label: "Footer line" },
  { id: "none", label: "None" },
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
            <p className="text-sm text-muted-foreground">Use this copy in place of your original.</p>
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
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Mark on the page
                <InfoTip label="About the page mark">
                  <p><strong>QR badge</strong> adds a QR code and short code to the corner of page one.</p>
                  <p><strong>Footer line</strong> adds one grey line at the foot of the last page.</p>
                  <p><strong>None</strong> leaves the page untouched. The file verifies the same way.</p>
                </InfoTip>
              </div>
              <ToggleGroup
                type="single"
                value={stamp}
                onValueChange={(v) => v && setStamp(v as StampMode)}
                disabled={state === "busy"}
                className="w-full"
                aria-label="Mark on the page"
              >
                {STAMP_CHOICES.map((c) => (
                  <ToggleGroupItem key={c.id} value={c.id} className="text-xs">{c.label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
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
