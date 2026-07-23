import { clearSessionCookie, hashToken, SESSION_COOKIE } from "../../../auth";
import { getD1 } from "../../../../db";

function readSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export async function POST(request: Request) {
  const token = readSession(request);
  if (token) await (await getD1()).prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  return Response.json({ success: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
