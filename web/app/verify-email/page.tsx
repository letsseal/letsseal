import VerifyEmailConfirm from "@/components/VerifyEmailConfirm";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmailConfirm token={token} />;
}
