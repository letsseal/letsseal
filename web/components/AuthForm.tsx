"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/Wordmark";
import { ProviderIcon } from "@/components/brand/ProviderIcon";
import { PasswordStrength } from "@/components/PasswordStrength";
import { passwordProblem } from "@/lib/password";

export default function AuthForm({
  mode, providers,
}: { mode: "signin" | "signup"; providers: { id: string; label: string }[] }) {
  const router = useRouter();
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
        if (!res.ok) { setError((await res.json()).error ?? "Sign up failed"); setLoading(false); return; }
        setSentTo(email.trim());
        setLoading(false);
      } catch {
        setError("Something went wrong.");
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const r = await signIn("credentials", { email, password, redirect: false });
      if (r?.error) {
        setError("Invalid email or password — or your email isn't verified yet.");
        setLoading(false);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Something went wrong.");
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
      <Shell>
        <div className="bg-white border rounded-2xl p-6 shadow-sm text-center">
          <MailCheck className="h-11 w-11 mx-auto text-green-600" />
          <h1 className="text-lg font-semibold mt-4">Confirm your email</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We sent a verification link to <b className="text-foreground">{sentTo}</b>. Click it to activate your
            account, then sign in.
          </p>
          <Button asChild className="mt-6 w-full"><Link href="/signin">Go to sign in</Link></Button>
          <button
            onClick={() => requestVerification(sentTo)}
            disabled={resent}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            {resent ? "Sent — check your inbox (and spam)." : "Didn't get it? Resend link"}
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white border rounded-2xl p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSignup ? "Free forever. Self-host or use ours." : "Sign in to your businesses."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password" type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "At least 10 characters" : "••••••••"}
            />
            {isSignup && <PasswordStrength password={password} />}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!isSignup && error && (
            <button
              type="button"
              onClick={() => requestVerification(email)}
              disabled={resent || !email.includes("@")}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              {resent ? "Verification link sent — check your inbox." : "Need to verify your email? Resend link"}
            </button>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        {providers.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px bg-border flex-1" /> or <span className="h-px bg-border flex-1" />
            </div>
            <div className="space-y-2">
              {providers.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  className="w-full"
                  onClick={() => signIn(p.id, { redirectTo: "/app" })}
                >
                  <ProviderIcon id={p.id} className="h-4 w-4 mr-2" />
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-4">
        {isSignup ? (
          <>Already have an account? <Link href="/signin" className="text-foreground font-medium hover:underline">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="text-foreground font-medium hover:underline">Create an account</Link></>
        )}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-secondary">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Wordmark href="/" size="lg" />
        </div>
        {children}
      </div>
    </div>
  );
}
