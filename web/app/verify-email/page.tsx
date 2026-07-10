import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

async function verify(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const vt = await db.verificationToken.findFirst({ where: { token } });
  if (!vt || vt.expires < new Date()) return false;
  try {
    await db.user.update({ where: { email: vt.identifier }, data: { emailVerified: new Date() } });
  } catch { return false; }
  await db.verificationToken.deleteMany({ where: { token } });
  return true;
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = await verify(token);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-secondary">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8"><Wordmark href="/" size="lg" /></div>
        <div className="bg-white border rounded-2xl p-8 shadow-sm">
          {ok ? (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <h1 className="text-lg font-semibold mt-4">Email verified</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your account is confirmed — you can now send documents for signing.
              </p>
              <Button asChild className="mt-6 w-full"><Link href="/signin">Continue to sign in</Link></Button>
            </>
          ) : (
            <>
              <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
              <h1 className="text-lg font-semibold mt-4">Link invalid or expired</h1>
              <p className="text-sm text-muted-foreground mt-1">
                This verification link is no longer valid. Sign in and we&apos;ll send you a fresh one.
              </p>
              <Button asChild variant="outline" className="mt-6 w-full"><Link href="/signin">Go to sign in</Link></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
