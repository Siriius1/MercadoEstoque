import Dashboard from "./dashboard";
import AuthScreen from "./auth-screen";
import { getSessionUser } from "./auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string; token?: string }> }) {
  const user = await getSessionUser();
  if (user) return <Dashboard user={user} />;
  const params = await searchParams;
  const allowed = ["login", "register", "forgot", "reset", "verify"] as const;
  const initialMode = allowed.includes(params.auth as typeof allowed[number]) ? params.auth as typeof allowed[number] : "login";
  return <AuthScreen initialMode={initialMode} token={params.token ?? ""} />;
}
