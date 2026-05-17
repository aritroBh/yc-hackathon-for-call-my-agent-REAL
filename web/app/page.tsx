import { redirect } from "next/navigation";
import { getSession, hasOnboarded } from "@/lib/auth";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await hasOnboarded())) redirect("/onboarding");
  redirect("/dashboard");
}
