import { prisma } from "@doza/db";
import { requireRole } from "@/lib/session";
import UsersManager from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireRole(["admin"]);

  const users = await prisma.crmUser.findMany({
    orderBy: { id: "asc" },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl text-ivory">Пользователи CRM</h1>
      <p className="mb-6 text-sm text-ivory-faint">{users.length} пользователей</p>
      <UsersManager users={users} />
    </div>
  );
}
