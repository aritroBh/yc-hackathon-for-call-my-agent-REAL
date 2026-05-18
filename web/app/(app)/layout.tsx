import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/shared/sidebar";
import { ChatDockGate } from "@/components/chat/chat-dock-gate";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar />
      <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
      <ChatDockGate />
    </div>
  );
}
