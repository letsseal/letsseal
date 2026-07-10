import AuthForm from "@/components/AuthForm";
import { enabledOAuthProviders } from "@/lib/oauth-providers";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <AuthForm mode="signin" providers={enabledOAuthProviders()} />;
}
