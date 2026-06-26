import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "seller" | "marketer";
    } & DefaultSession["user"];
  }
  interface User {
    role: "admin" | "seller" | "marketer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "seller" | "marketer";
    uid: string;
  }
}
