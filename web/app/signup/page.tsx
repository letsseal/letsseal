import AuthForm from "@/components/AuthForm";
import { enabledOAuthProviders } from "@/lib/oauth-providers";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <AuthForm mode="signup" providers={enabledOAuthProviders()} />;
}
