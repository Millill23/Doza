import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "seller" | "marketer" | "influencer";
    } & DefaultSession["user"];
  }
  interface User {
    role: "admin" | "seller" | "marketer" | "influencer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "seller" | "marketer" | "influencer";
    uid: string;
  }
}
