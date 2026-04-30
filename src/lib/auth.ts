import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { connectToDatabase } from "@/lib/mongodb";
import Admin from "@/models/Admin";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null;
        }

        const configuredAdminUsername = process.env.ADMIN_USERNAME?.trim();
        const configuredAdminPassword = process.env.ADMIN_PASSWORD;
        const submittedUsername = credentials.username.trim();

        if (
          configuredAdminUsername &&
          configuredAdminPassword &&
          submittedUsername === configuredAdminUsername &&
          credentials.password === configuredAdminPassword
        ) {
          return {
            id: submittedUsername,
            name: submittedUsername,
          };
        }

        await connectToDatabase();

        const admin = await Admin.findOne({
          username: submittedUsername,
        }).lean();

        if (!admin) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          credentials.password,
          admin.passwordHash
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: String(admin._id),
          name: admin.username,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
      }

      return session;
    },
  },
};