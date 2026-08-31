import { requireSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";

export default async function DashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const role = session.user.role;

  const name = session.user.name ?? session.user.email ?? "";

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} name={name} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
