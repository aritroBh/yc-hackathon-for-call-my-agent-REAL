import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { OnboardingFlow } from "./_components/onboarding-flow";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <OnboardingFlow />;
}
