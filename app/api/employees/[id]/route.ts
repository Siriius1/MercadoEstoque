import { getD1 } from "../../../../db";
import { getSessionUser, hashPassword } from "../../../auth";
import { isValidEmail, normalizeEmail } from "../../../validation";

async function requireAdmin(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { response: Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 }), user: null };
  if (user.role !== "admin") return { response: Response.json({ error: "Somente administradores podem gerenciar funcionários." }, { status: 403 }), user: null };
  return { response: null, user };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin(request);
  if (access.response) return access.response;
  const { id } = await context.params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) return Response.json({ error: "Funcionário inválido." }, { status: 400 });
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "cashier";
  if (name.length < 2) return Response.json({ error: "Informe o nome completo." }, { status: 400 });
  if (!isValidEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
  if (password && password.length < 8) return Response.json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, { status: 400 });
  const d1 = await getD1();
  const duplicate = await d1.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").bind(email, employeeId).first();
  if (duplicate) return Response.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });
  const currentEmployee = await d1.prepare("SELECT role FROM users WHERE id = ?").bind(employeeId).first<{ role: string }>();
  if (!currentEmployee) return Response.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (currentEmployee.role === "admin" && role !== "admin") {
    const admins = await d1.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").first<{ total: number }>();
    if ((admins?.total ?? 0) <= 1) return Response.json({ error: "O sistema precisa manter pelo menos um administrador." }, { status: 400 });
  }
  if (password) {
    const passwordHash = await hashPassword(password);
    await d1.prepare("UPDATE users SET name = ?, email = ?, role = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, email, role, passwordHash, employeeId).run();
  } else {
    await d1.prepare("UPDATE users SET name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, email, role, employeeId).run();
  }
  const employee = await d1.prepare("SELECT id, name, email, role, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users WHERE id = ?").bind(employeeId).first();
  if (!employee) return Response.json({ error: "Funcionário não encontrado." }, { status: 404 });
  return Response.json({ employee });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin(request);
  if (access.response || !access.user) return access.response;
  const { id } = await context.params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) return Response.json({ error: "Funcionário inválido." }, { status: 400 });
  if (employeeId === access.user.id) return Response.json({ error: "Você não pode excluir sua própria conta." }, { status: 400 });
  const d1 = await getD1();
  const employee = await d1.prepare("SELECT id, role FROM users WHERE id = ?").bind(employeeId).first<{ id: number; role: string }>();
  if (!employee) return Response.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (employee.role === "admin") {
    const admins = await d1.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").first<{ total: number }>();
    if ((admins?.total ?? 0) <= 1) return Response.json({ error: "O sistema precisa manter pelo menos um administrador." }, { status: 400 });
  }
  await d1.prepare("DELETE FROM users WHERE id = ?").bind(employeeId).run();
  return Response.json({ deleted: true });
}
