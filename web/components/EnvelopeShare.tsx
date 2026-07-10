"use client";

import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Contact, Check, Clock, ShieldCheck, Download, Anchor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recipientColor } from "@/lib/signers";

type Signer = { name: string; email: string | null; kind: string; token: string; status: string; accessCode: string | null };
type Props = {
  slug: string;
  envelope: { id: string; title: string; status: string; completed: boolean; anchorState: string; btcBlock: number | null };
  org: { name: string; brandColor: string };
  signers: Signer[];
};

export default function EnvelopeShare({ slug, envelope, org, signers }: Props) {
  const pathFor = (token: string) => `/sign/${token}`;
  const copyLink = (token: string, msg: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
    toast.success(msg);
  };

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4 text-muted-foreground">
        <Link href={`/${slug}`}><ArrowLeft className="h-4 w-4" /> {org.name}</Link>
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold"
              style={{ background: org.brandColor }}>{org.name[0]}</span>
        <div>
          <h1 className="text-xl font-semibold">{envelope.title}</h1>
          <p className="text-xs text-muted-foreground">Send links or hand your device to in-person signers.</p>
        </div>
      </div>

      {envelope.completed && (
        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-green-700"><ShieldCheck className="h-4 w-4" /> Completed & sealed</span>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={`/d/${envelope.id}`} target="_blank"><ExternalLink className="h-3.5 w-3.5" /> Public proof</a>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={`/api/file/${envelope.id}?variant=sealed`} target="_blank"><Download className="h-3.5 w-3.5" /> Sealed PDF</a>
              </Button>
            </div>
          </div>
          {envelope.anchorState !== "none" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Anchor className="h-3.5 w-3.5 text-muted-foreground" />
              {envelope.anchorState === "confirmed"
                ? <>Bitcoin block <b>{envelope.btcBlock}</b> · <a href={`https://mempool.space/block/${envelope.btcBlock}`} target="_blank" className="text-blue-600 hover:underline">explorer →</a></>
                : "Recording an independent timestamp — confirming (~a few hours)"}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {signers.map((s, i) => {
          const c = recipientColor(i);
          const path = pathFor(s.token);
          const inPerson = !s.email;
          const signed = s.status === "signed";
          return (
            <div key={s.token} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: c.solid }} />
                <span className="font-medium">{s.name}</span>
                <Badge variant="secondary" className="ml-auto font-normal gap-1">
                  {signed ? <><Check className="h-3 w-3 text-green-600" /> signed</> : <><Clock className="h-3 w-3" /> pending</>}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{s.email || "no email — sign in person"}</div>
              {s.accessCode && <div className="text-xs text-muted-foreground mt-1">Access code: <b>{s.accessCode}</b></div>}

              {!signed && (
                inPerson ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button asChild className="flex-1 gap-2 text-white" style={{ background: c.solid }}>
                      <a href={path}><Contact className="h-4 w-4" /> Hand device to {s.name.split(" ")[0] || "signer"}</a>
                    </Button>
                    <Button size="icon" variant="outline" className="shrink-0"
                            onClick={() => copyLink(s.token, "Link copied")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-3">
                    <Button variant="outline" className="flex-1 gap-2"
                            onClick={() => copyLink(s.token, "Link copied — email it to them")}>
                      <Copy className="h-4 w-4" /> Copy signing link
                    </Button>
                    <Button asChild size="icon" variant="outline" className="shrink-0">
                      <a href={path} target="_blank"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
