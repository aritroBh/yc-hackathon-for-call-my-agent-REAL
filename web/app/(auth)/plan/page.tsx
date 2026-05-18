import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PlanCanvas } from "./_components/plan-canvas";

export default async function PlanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <PlanCanvas />;
}
