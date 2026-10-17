"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CircleAlert, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field } from "@/components/common/field";
import { CenteredPage } from "@/components/common/centered-page";
import { ProviderIcon } from "@/components/brand/ProviderIcon";
import { PasswordStrength } from "@/components/PasswordStrength";
import { passwordProblem } from "@/lib/password";

export default function AuthForm({
  mode, providers,
}: { mode: "signin" | "signup"; providers: { id: string; label: string }[] }) {
  const router = useRouter();
  const rawNext = useSearchParams().get("next");
  const safeNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const next = safeNext ?? "/app";
  const withNext = (path: string) => (safeNext ? `${path}?next=${encodeURIComponent(safeNext)}` : path);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup) {
      const problem = passwordProblem(password);
      if (problem) { setError(problem); return; }
      setLoading(true);
      try {
        const res = await fetch("/api/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) { setError((await res.json()).error ?? "Sign up failed."); setLoading(false); return; }
        setSentTo(email.trim());
        setLoading(false);
      } catch {
        setError("Something went wrong. Try again.");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const r = await signIn("credentials", { email, password, redirect: false });
      if (r?.error) {
        setError("Incorrect email or password, or your email isn't verified yet.");
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  async function requestVerification(target: string) {
    setResent(false);
    try {
      await fetch("/api/verify-email/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
    } finally {
      setResent(true);
    }
  }

  if (sentTo) {
    return (
      <CenteredPage
        icon={MailCheck}
        title="Check your email"
        description={<>We sent a verification link to <span className="font-medium text-foreground">{sentTo}</span>.</>}
      >
        <div className="grid gap-2">
          <Button asChild className="w-full"><Link href={withNext("/signin")}>Go to sign in</Link></Button>
          <Button variant="ghost" className="w-full" onClick={() => requestVerification(sentTo)} disabled={resent}>
            {resent ? "Link sent. Check your spam folder too." : "Resend link"}
          </Button>
        </div>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage title={isSignup ? "Create an account" : "Sign in"}>
      <form onSubmit={submit} className="grid gap-4">
        {isSignup && (
          <Field label="Name" htmlFor="name">
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input
            id="email" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password" type="password" required
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder={isSignup ? "At least 10 characters" : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && <PasswordStrength password={password} />}
        </Field>

        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              <p>{error}</p>
              {!isSignup && (
                resent ? (
                  <p>Verification link sent. Check your inbox.</p>
                ) : (
                  <Button
                    type="button" variant="link" className="h-auto p-0 text-current"
                    onClick={() => requestVerification(email)}
                    disabled={!email.includes("@")}
                  >
                    Resend verification link
                  </Button>
                )
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      {providers.length > 0 && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {providers.map((p) => (
              <Button key={p.id} variant="outline" className="w-full" onClick={() => signIn(p.id, { redirectTo: next })}>
                <ProviderIcon id={p.id} className="size-4" />
                Continue with {p.label}
              </Button>
            ))}
          </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <Link href={withNext(isSignup ? "/signin" : "/signup")} className="font-medium text-foreground hover:underline underline-offset-4">
          {isSignup ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </CenteredPage>
  );
}
