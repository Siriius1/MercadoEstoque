import { getD1 } from "../../../db";
import { getSessionUser, hashPassword } from "../../auth";
import { isValidEmail, normalizeEmail } from "../../validation";

async function requireAdmin(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { response: Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 }), user: null };
  if (user.role !== "admin") return { response: Response.json({ error: "Somente administradores podem gerenciar funcionários." }, { status: 403 }), user: null };
  return { response: null, user };
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (access.response) return access.response;
  const d1 = await getD1();
  const result = await d1.prepare("SELECT id, name, email, role, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users ORDER BY name COLLATE NOCASE").all();
  return Response.json({ employees: result.results });
}

export async function POST(request: Request) {
  const access = await requireAdmin(request);
  if (access.response) return access.response;
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "cashier";
  if (name.length < 2) return Response.json({ error: "Informe o nome completo." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "A senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  const d1 = await getD1();
  const existing = await d1.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return Response.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
  const passwordHash = await hashPassword(password);
  const employee = await d1.prepare("INSERT INTO users (name, email, password_hash, email_verified_at, role) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?) RETURNING id, name, email, role").bind(name, email, passwordHash, role).first();
  return Response.json({ employee }, { status: 201 });
}
