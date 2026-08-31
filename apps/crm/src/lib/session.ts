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

/**
 * Куда отправлять человека, которому сюда нельзя.
 *
 * Для блогера это не дашборд: дашборд ему тоже закрыт, и отправлять его туда
 * значит зациклить редиректы вместо того, чтобы показать страницу.
 */
export function homeFor(role: Role): string {
  return role === "influencer" ? "/my-sales" : "/";
}

export async function requireRole(roles: Role[]) {
  const session = await requireSession();
  const role = session.user.role;
  if (!roles.includes(role)) redirect(homeFor(role));
  return session;
}
