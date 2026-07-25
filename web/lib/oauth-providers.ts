import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Facebook from "next-auth/providers/facebook";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import Apple from "next-auth/providers/apple";
import GitLab from "next-auth/providers/gitlab";
import Discord from "next-auth/providers/discord";
import LinkedIn from "next-auth/providers/linkedin";

type ProviderDef = {
  id: string;
  label: string;
  env: string;
  provider: Provider;
};

const REGISTRY: ProviderDef[] = [
  { id: "google", label: "Google", env: "GOOGLE", provider: Google },
  { id: "github", label: "GitHub", env: "GITHUB", provider: GitHub },
  { id: "microsoft-entra-id", label: "Microsoft", env: "MICROSOFT_ENTRA_ID", provider: MicrosoftEntraId },
  { id: "facebook", label: "Facebook", env: "FACEBOOK", provider: Facebook },
  { id: "apple", label: "Apple", env: "APPLE", provider: Apple },
  { id: "gitlab", label: "GitLab", env: "GITLAB", provider: GitLab },
  { id: "discord", label: "Discord", env: "DISCORD", provider: Discord },
  { id: "linkedin", label: "LinkedIn", env: "LINKEDIN", provider: LinkedIn },
];

function isConfigured(env: string): boolean {
  return !!(process.env[`AUTH_${env}_ID`]?.trim() && process.env[`AUTH_${env}_SECRET`]?.trim());
}

export function activeOAuthProviders(): Provider[] {
  return REGISTRY.filter((p) => isConfigured(p.env)).map((p) => p.provider);
}

export function enabledOAuthProviders(): { id: string; label: string }[] {
  return REGISTRY.filter((p) => isConfigured(p.env)).map(({ id, label }) => ({ id, label }));
}

export const SUPPORTED_OAUTH = REGISTRY.map(({ id, label, env }) => ({ id, label, env }));
