import { Wordmark } from "@/components/brand/Wordmark";
import VerifyEmailConfirm from "@/components/VerifyEmailConfirm";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-secondary">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-8"><Wordmark href="/" size="lg" /></div>
        <div className="bg-white border rounded-2xl p-8 shadow-sm">
          <VerifyEmailConfirm token={token} />
        </div>
      </div>
    </div>
  );
}
