"use client";

import { useState } from "react";
import { AlertCircle, FileCheck2 } from "lucide-react";
import { ProviderIcon } from "@/components/brand/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dropzone } from "@/components/common/dropzone";

type Picked = { name: string; sha: string } | null;

export function IdentitySeal({
  slug,
  providers,
  initialError,
}: {
  slug: string;
  providers: { id: string; label: string }[];
  initialError?: string | null;
}) {
  const [picked, setPicked] = useState<Picked>(null);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState(errorText(initialError));

  async function choose(file: File) {
    setHashing(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setPicked({ name: file.name, sha });
    } catch {
      setError("Could not read that file. Try another one.");
    } finally {
      setHashing(false);
    }
  }

  function sealWith(providerId: string) {
    if (!picked) return;
    const q = new URLSearchParams({ provider: providerId, org: slug, sha256: picked.sha });
    if (picked.name) q.set("title", picked.name);
    window.location.href = `/api/identity/start?${q.toString()}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{picked ? "Prove your email to seal it" : "Choose a file"}</CardTitle>
        <CardDescription>
          {picked
            ? "The provider vouches for your email. Let's Seal doesn't verify identity itself."
            : "The file is hashed in your browser and never uploaded."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!picked ? (
          <Dropzone
            busy={hashing}
            busyTitle="Hashing…"
            title="Drop any file, or click to choose"
            onFiles={(f) => choose(f[0])}
          />
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <FileCheck2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{picked.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">sha256:{picked.sha}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setError(""); }}>
                Change
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {providers.map((p) => (
                <Button key={p.id} variant="outline" className="w-full" onClick={() => sealWith(p.id)}>
                  <ProviderIcon id={p.id} className="size-4" />
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function errorText(reason?: string | null): string {
  switch (reason) {
    case "denied": return "Sign-in was cancelled. Nothing was sealed.";
    case "expired": return "The sign-in window expired. Try again.";
    case "not_verified": return "That provider didn't confirm a verified email, so nothing was sealed.";
    case "bad_state": return "Sign-in could not be verified. Try again.";
    case "not_a_member": return "You're not a member of this business.";
    case "not_signed_in": return "Sign in and try again.";
    case "provider_unavailable": return "That identity provider isn't configured.";
    case "seal_failed": return "The seal could not be completed. Try again.";
    case "bad_digest": return "Something went wrong preparing the file. Try again.";
    case "no_code": return "Sign-in returned no authorization. Try again.";
    default: return "";
  }
}
