import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { activeOAuthProviders } from "@/lib/oauth-providers";
import { rateLimitedAsync } from "@/lib/ratelimit";
import { clientIp } from "@/lib/ip";

let decoyHash: Promise<string> | null = null;
const getDecoy = () => (decoyHash ??= hash("letsseal-timing-decoy"));

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (creds, req) => {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const hdrs = (req as { headers?: { get(n: string): string | null } } | undefined)?.headers;
      const ip = hdrs && typeof hdrs.get === "function" ? clientIp({ headers: hdrs }) : "local";
      if ((await rateLimitedAsync(`login:ip:${ip}`, 20, 15 * 60_000)) || (await rateLimitedAsync(`login:email:${email}`, 10, 15 * 60_000))) {
        return null;
      }
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        await verify(await getDecoy(), password).catch(() => false); // equalise timing
        return null;
      }
      const ok = await verify(user.passwordHash, password);
      if (!ok) return null;
      // Password accounts must confirm their email before they can sign in.
      // Fail like a bad credential (no session issued); the sign-in screen always
      // offers a "resend verification" link so an unverified user isn't stuck.
      // OAuth accounts never reach here — the provider has already vouched, and
      // the signIn event below stamps emailVerified for them.
      if (!user.emailVerified) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
  ...activeOAuthProviders(),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Self-hosted behind a reverse proxy / tunnel (nginx, Cloudflare) — trust the
  // forwarded host so Auth.js accepts requests on our own domains.
  trustHost: true,
  session: { strategy: "jwt" }, // required for the Credentials provider
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    session: ({ session, token }) => {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    // OAuth providers have already confirmed the address they hand us, so an
    // OAuth sign-in counts as verified. Stamp emailVerified on first sign-in so
    // these accounts are never wrongly blocked by the send-gate or verify banner.
    signIn: async ({ user, account }) => {
      if (account && account.provider !== "credentials" && user.id) {
        await db.user.updateMany({
          where: { id: user.id, emailVerified: null },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
});
