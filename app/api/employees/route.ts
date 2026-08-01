import { getD1 } from "../../../db";
import { getSessionUser, randomToken } from "../../auth";
import { createEmployeeInvite } from "../../employee-invite";
import { isValidEmail, isValidFullName, normalizeEmail, normalizeFullName } from "../../validation";

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
  const result = await d1.prepare("SELECT id, name, email, role, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users WHERE company_id = ? ORDER BY name COLLATE NOCASE").bind(access.user!.companyId).all();
  return Response.json({ employees: result.results });
}

export async function POST(request: Request) {
  const access = await requireAdmin(request);
  if (access.response) return access.response;
  const body = await request.json() as Record<string, unknown>;
  const name = normalizeFullName(body.name);
  const email = normalizeEmail(body.email);
  const role = body.role === "admin" ? "admin" : "cashier";
  if (!isValidFullName(name)) return Response.json({ error: "Informe o nome e sobrenome do funcionário." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  const d1 = await getD1();
  const existing = await d1.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return Response.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
  const employee = await d1.prepare("INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING id, name, email, role").bind(access.user!.companyId, name, email, `invite_pending$${randomToken()}`, role).first<{ id: number; name: string; email: string; role: string }>();
  if (!employee) return Response.json({ error: "Não foi possível criar o funcionário." }, { status: 500 });
  const mail = await createEmployeeInvite({ d1, userId: employee.id, name, email, origin: new URL(request.url).origin });
  return Response.json({
    employee,
    inviteSent: mail.sent,
    previewUrl: mail.previewUrl,
    deliveryWarning: "deliveryWarning" in mail ? mail.deliveryWarning : null,
  }, { status: 201 });
}
