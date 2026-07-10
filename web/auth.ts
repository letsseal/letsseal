import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { activeOAuthProviders } from "@/lib/oauth-providers";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (creds) => {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const user = await db.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;
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
  session: { strategy: "jwt" }, 
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
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
