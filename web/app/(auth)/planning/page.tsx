import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PlanningLoader } from "./_components/planning-loader";

export default async function PlanningPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <PlanningLoader />;
}
