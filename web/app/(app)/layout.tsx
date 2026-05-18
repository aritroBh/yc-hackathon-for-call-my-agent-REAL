import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/shared/sidebar";
import { ChatDockGate } from "@/components/chat/chat-dock-gate";
import { ResearchRunner } from "@/components/shared/research-runner";

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
      {/* Dock is gated off on /settings and /research (main's
          ChatDockGate); ResearchRunner still owns the long deep-research
          SSE so it survives navigation between app pages. */}
      <ChatDockGate />
      <ResearchRunner />
    </div>
  );
}
