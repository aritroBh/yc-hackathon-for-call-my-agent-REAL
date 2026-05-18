import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthScreen } from "./_components/auth-screen";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");
  return <AuthScreen />;
}
