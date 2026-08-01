import Dashboard from "./dashboard";
import AuthScreen from "./auth-screen";
import { getSessionUser } from "./auth";
import { getGoogleClientId } from "./google-auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string; token?: string; welcome?: string; demo?: string }> }) {
  const user = await getSessionUser();
  if (user) return <Dashboard user={{ name: user.name, email: user.email, role: user.role, companyName: user.companyName, isDemo: user.isDemo, sessionExpiresAt: user.sessionExpiresAt }} />;
  const params = await searchParams;
  const registrationOpen = true;
  const allowed = ["login", "register", "forgot", "reset", "verify", "invite", "pending", "approve", "reject"] as const;
  const requestedMode = allowed.includes(params.auth as typeof allowed[number]) ? params.auth as typeof allowed[number] : "login";
  const initialMode = requestedMode === "register" && !registrationOpen ? "login" : requestedMode;
  const welcome = params.demo === "expired" ? "demo-expired" : params.welcome ?? "";
  return <AuthScreen initialMode={initialMode} token={params.token ?? ""} googleClientId={getGoogleClientId()} registrationOpen={registrationOpen} welcome={welcome} />;
}
