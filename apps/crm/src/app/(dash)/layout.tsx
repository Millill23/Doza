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
    <div className="min-h-screen lg:flex">
      <Sidebar role={role} name={name} />
      <main className="min-w-0 flex-1 overflow-x-auto">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
