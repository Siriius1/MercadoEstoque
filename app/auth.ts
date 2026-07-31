import { headers } from "next/headers";
import { getD1 } from "../db";

export const SESSION_COOKIE = "mercado_session";
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210_000 }, key, 256);
  return `pbkdf2_sha256$210000$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsText, saltText, expectedText] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsText || !saltText || !expectedText) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltText), iterations: Number(iterationsText) }, key, 256);
  const actual = new Uint8Array(bits);
  const expected = base64UrlToBytes(expectedText);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function readCookie(cookieHeader: string, name: string) {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export type SessionUser = {
  id: number;
  companyId: number;
  companyKey: string;
  companyName: string;
  isDemo: boolean;
  name: string;
  email: string;
  role: string;
};

export async function getSessionUser(request?: Request): Promise<SessionUser | null> {
  const cookieHeader = request ? request.headers.get("cookie") ?? "" : (await headers()).get("cookie") ?? "";
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const d1 = await getD1();
  const user = await d1.prepare(
    "SELECT users.id, users.company_id AS companyId, companies.public_key AS companyKey, companies.name AS companyName, companies.is_demo AS isDemo, users.name, users.email, users.role FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id JOIN companies ON companies.id = users.company_id WHERE auth_sessions.token_hash = ? AND datetime(auth_sessions.expires_at) > CURRENT_TIMESTAMP AND users.email_verified_at IS NOT NULL"
  ).bind(tokenHash).first<SessionUser>();
  return user ?? null;
}

export async function requireApiUser(request: Request) {
  return (await getSessionUser(request)) ? null : Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
}

export function sessionCookie(token: string, secure = false, maxAge = 60 * 60 * 24 * 7) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
