import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

class DatabaseUnavailableError extends CredentialsSignin {
  code = "database-unavailable";
}

function isDatabaseConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      ["P1001", "P1002", "P1017", "P2010", "P2024"].includes(error.code) ||
      /server selection timeout|no available servers|received fatal alert|tls|ssl|internalerror/i.test(
        error.message,
      )
    );
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /server selection timeout|no available servers|received fatal alert|timed out|tls|ssl|internalerror/i.test(
      error.message,
    );
  }

  return (
    error instanceof Error &&
    /server selection timeout|no available servers|received fatal alert|timed out|econnrefused|enotfound|tls|ssl|internalerror/i.test(
      error.message,
    )
  );
}

function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

const {
  handlers,
  auth: getSession,
  signIn,
  signOut,
} = NextAuth({
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier =
          typeof credentials.identifier === "string"
            ? credentials.identifier.trim().toLowerCase()
            : "";
        const password =
          typeof credentials.password === "string" ? credentials.password : "";

        if (!identifier || !password) {
          return null;
        }

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: identifier },
            select: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              isActive: true,
              role: true,
              profilePhotoUrl: true,
            },
          });
        } catch (error) {
          if (!isDatabaseConnectionError(error)) {
            throw error;
          }

          console.error("Credential sign-in failed: MongoDB is unreachable", {
            code:
              error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : "connection-error",
          });
          throw new DatabaseUnavailableError();
        }

        if (
          !user ||
          !user.isActive ||
          !(await compare(password, user.passwordHash))
        ) {
          return null;
        }

        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        } catch (error) {
          if (!isDatabaseConnectionError(error)) {
            throw error;
          }

          console.error("Credential sign-in failed while updating login time", {
            code:
              error instanceof Prisma.PrismaClientKnownRequestError
                ? error.code
                : "connection-error",
          });
          throw new DatabaseUnavailableError();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.profilePhotoUrl,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && typeof user.id === "string") {
        token.id = user.id;
        token.sub = user.id;
        token.role = user.role;
        token.picture = user.image ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (!session.user) {
        return session;
      }

      const userId = typeof token.sub === "string" ? token.sub : token.id;
      if (typeof userId === "string") {
        session.user.id = userId;
      }

      if (typeof token.role === "string" && isUserRole(token.role)) {
        session.user.role = token.role;
      }
      session.user.image =
        typeof token.picture === "string" ? token.picture : null;

      return session;
    },
  },
});

export { handlers, signIn, signOut };
export const authForProxy = getSession;

export async function auth() {
  const session = await getSession();
  if (!session?.user || typeof session.user.id !== "string") {
    return null;
  }

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true, profilePhotoUrl: true },
  });
  if (!account?.isActive) {
    return null;
  }

  return {
    ...session,
    user: {
      ...session.user,
      role: account.role,
      image: account.profilePhotoUrl,
    },
  };
}

export { UserRole };
