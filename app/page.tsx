import Dashboard from "./dashboard";
import AuthScreen from "./auth-screen";
import { getSessionUser } from "./auth";
import { getGoogleClientId } from "./google-auth";
import { getD1 } from "../db";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string; token?: string; welcome?: string }> }) {
  const user = await getSessionUser();
  if (user) return <Dashboard user={user} />;
  const params = await searchParams;
  const d1 = await getD1();
  const owner = await d1.prepare("SELECT id FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL LIMIT 1").first();
  const registrationOpen = !owner;
  const allowed = ["login", "register", "forgot", "reset", "verify", "invite"] as const;
  const requestedMode = allowed.includes(params.auth as typeof allowed[number]) ? params.auth as typeof allowed[number] : "login";
  const initialMode = requestedMode === "register" && !registrationOpen ? "login" : requestedMode;
  return <AuthScreen initialMode={initialMode} token={params.token ?? ""} googleClientId={getGoogleClientId()} registrationOpen={registrationOpen} welcome={params.welcome === "1"} />;
}
