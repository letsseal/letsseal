"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/common/field";

const CATEGORIES = [
  { v: "impersonation", label: "Impersonating another business" },
  { v: "fraud", label: "Fraudulent or forged documents" },
  { v: "phishing", label: "Phishing or scam" },
  { v: "other", label: "Other abuse" },
];

export function ReportForm({ slug, orgName, proofHash }: { slug: string; orgName: string; proofHash?: string }) {
  const [category, setCategory] = useState("impersonation");
  const [detail, setDetail] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending"); setError("");
    try {
      const r = await fetch("/api/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: slug, category, detail, reporterEmail: email, proofHash: proofHash || undefined }),
      });
      const d = await r.json();
      if (r.ok) setState("done");
      else { setState("error"); setError(d.error || "Could not submit the report."); }
    } catch { setState("error"); setError("Network error. Try again."); }
  }

  if (state === "done") {
    return (
      <Alert variant="success">
        <CircleCheck />
        <AlertTitle>Report received</AlertTitle>
        <AlertDescription>
          We&apos;ll review {orgName} and act if it breaches our policy. Suspended businesses can&apos;t seal, and
          every proof they issued is flagged.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{orgName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <Field label="What's wrong?">
            <RadioGroup value={category} onValueChange={setCategory} aria-label="What's wrong?">
              {CATEGORIES.map((c) => (
                <div key={c.v} className="flex items-center gap-2">
                  <RadioGroupItem id={`cat-${c.v}`} value={c.v} />
                  <Label htmlFor={`cat-${c.v}`} className="font-normal">{c.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </Field>
          <Field label="Details" htmlFor="detail" optional>
            <Textarea
              id="detail" rows={4} maxLength={2000} value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder="What did you see? Who is being impersonated?"
            />
          </Field>
          <Field label="Your email" htmlFor="email" optional>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={state === "sending"}>
            {state === "sending" && <Loader2 className="animate-spin" />}
            Submit report
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
