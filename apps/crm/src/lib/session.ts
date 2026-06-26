import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, type Role } from "./auth";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(roles: Role[]) {
  const session = await requireSession();
  const role = session.user.role;
  if (!roles.includes(role)) redirect("/");
  return session;
}
