"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, AlertCircle, Fingerprint, FileCheck2 } from "lucide-react";
import { ProviderIcon } from "@/components/brand/ProviderIcon";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [hashing, setHashing] = useState(false);
  const [drag, setDrag] = useState(false);
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
      setError("Could not read that file.");
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
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <h3 className="text-[15px] font-semibold">Seal under your verified identity</h3>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Pick a file, then prove your email with a provider. The seal records that
        <b> they </b> verified you — Let&apos;s Seal never checks identity itself. The file is
        hashed in your browser; its bytes never leave your device.
      </p>

      {!picked ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) choose(f); }}
          disabled={hashing}
          className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            drag ? "border-primary bg-primary/5" : "border-input hover:border-primary/50 hover:bg-secondary/50"
          } ${hashing ? "opacity-70" : ""}`}
        >
          {hashing ? (
            <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Hashing…</span></>
          ) : (
            <><Upload className="h-6 w-6 text-primary" /><span className="text-sm text-muted-foreground">Drop any file, or click to choose</span></>
          )}
        </button>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-xl border bg-secondary/40 p-3">
            <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{picked.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">sha256:{picked.sha}</p>
            </div>
            <button
              onClick={() => { setPicked(null); setError(""); }}
              className="ml-auto shrink-0 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Change
            </button>
          </div>

          <p className="mt-4 text-[13px] font-medium">Prove your email to seal it:</p>
          <div className="mt-2 flex flex-col gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => sealWith(p.id)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold hover:bg-secondary"
              >
                <ProviderIcon id={p.id} className="h-4 w-4" />
                Continue with {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }}
      />
    </div>
  );
}

function errorText(reason?: string | null): string {
  switch (reason) {
    case "denied": return "Sign-in was cancelled — nothing was sealed.";
    case "expired": return "The sign-in window expired. Please try again.";
    case "not_verified": return "That provider didn't confirm a verified email, so no seal was made.";
    case "bad_state": return "Sign-in could not be verified (state mismatch). Please try again.";
    case "not_a_member": return "You're not a member of this organization.";
    case "not_signed_in": return "Please sign in and try again.";
    case "provider_unavailable": return "That identity provider isn't configured.";
    case "seal_failed": return "The seal could not be completed. Please try again.";
    case "bad_digest": return "Something went wrong preparing the file. Please try again.";
    case "no_code": return "Sign-in returned no authorization. Please try again.";
    default: return "";
  }
}
