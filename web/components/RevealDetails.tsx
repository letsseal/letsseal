"use client";

import { useState } from "react";
import { CircleCheck, Contact, Link2, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, DetailRow } from "@/components/common/detail-list";
import { Dropzone } from "@/components/common/dropzone";

type Signer = { name: string; title: string | null; department: string | null; channel: string; email: string | null; signedAt: string | null };
type Trail = {
  signers: Signer[];
  entries: { action: string; actorName: string; at: string }[];
  sharedSession: boolean;
  chainIntact: boolean;
};
type Revealed = { title: string | null; trail: Trail | null };

const CHANNEL: Record<string, { icon: React.ElementType; label: string }> = {
  email: { icon: Mail, label: "Signed via emailed link" },
  link: { icon: Link2, label: "Signed via shared link" },
  in_person: { icon: Contact, label: "Signed in person" },
};

export function SignerList({ signers }: { signers: Signer[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {signers.map((s, i) => {
        const ch = CHANNEL[s.channel] ?? CHANNEL.email;
        const Icon = ch.icon;
        return (
          <li key={i} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{s.name}</p>
              {(s.title || s.department) && (
                <p className="text-xs text-muted-foreground">{[s.title, s.department].filter(Boolean).join(", ")}</p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{ch.label}{s.email ? ` · ${s.email}` : ""}</span>
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {s.signedAt ? new Date(s.signedAt).toLocaleString() : "Not signed"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RevealDetails({ hash, hasTrail }: { hash: string; hasTrail: boolean }) {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Revealed | null>(null);
  const [error, setError] = useState("");

  async function reveal(file: File) {
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/d/${hash}/reveal`, { method: "POST", body });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Couldn't reveal details.");
      setData(j as Revealed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reveal details.");
    } finally {
      setBusy(false);
    }
  }

  if (data) {
    const signers = data.trail?.signers ?? [];
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleCheck className="size-4 text-success" /> Details unlocked
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.title && (
            <DetailList>
              <DetailRow label="Document">{data.title}</DetailRow>
            </DetailList>
          )}
          {signers.length > 0 && (
            <>
              <SignerList signers={signers} />
              <p className="text-xs text-muted-foreground">
                Attribution reflects control of the signing channel, recorded tamper-evidently. It is not identity verification.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{hasTrail ? "Document and signer details are private" : "Document details are private"}</CardTitle>
        <CardDescription>
          The subject{hasTrail ? " and who signed" : ""} {hasTrail ? "aren’t" : "isn’t"} shown publicly. If you have
          the document, upload it to confirm it matches and unlock the details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Dropzone
          size="sm"
          accept="application/pdf,.pdf"
          busy={busy}
          onFiles={(f) => f[0] && reveal(f[0])}
          title="Upload the file to unlock"
          busyTitle="Checking…"
          hint="It’s uploaded to check it and isn’t stored."
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
