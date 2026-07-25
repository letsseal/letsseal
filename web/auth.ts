import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { activeOAuthProviders } from "@/lib/oauth-providers";
import { rateLimitedAsync } from "@/lib/ratelimit";
import { clientIp } from "@/lib/ip";
import { MAX_PASSWORD_LENGTH } from "@/lib/password";
import { SESSION_VERSION_CLAIM, currentSessionVersion, sessionIsCurrent } from "@/lib/session";

let decoyHash: Promise<string> | null = null;
const getDecoy = () => (decoyHash ??= hash("letsseal-timing-decoy"));

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (creds, req) => {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      if (email.length > 320 || password.length > MAX_PASSWORD_LENGTH) return null;
      const hdrs = (req as { headers?: { get(n: string): string | null } } | undefined)?.headers;
      const ip = hdrs && typeof hdrs.get === "function" ? clientIp({ headers: hdrs }) : "local";
      if ((await rateLimitedAsync(`login:ip:${ip}`, 20, 15 * 60_000)) || (await rateLimitedAsync(`login:email:${email}`, 10, 15 * 60_000))) {
        return null;
      }
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        await verify(await getDecoy(), password).catch(() => false); 
        return null;
      }
      const ok = await verify(user.passwordHash, password);
      if (!ok) return null;
      if (!user.emailVerified) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
  ...activeOAuthProviders(),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: Number(process.env.AUTH_SESSION_MAX_AGE ?? 7 * 24 * 60 * 60), 
  },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token[SESSION_VERSION_CLAIM] = (await currentSessionVersion(user.id)) ?? 0;
        return token;
      }
      return (await sessionIsCurrent(token)) ? token : null;
    },
    session: ({ session, token }) => {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
  events: {
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
