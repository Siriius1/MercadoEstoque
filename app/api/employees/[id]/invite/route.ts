import { getD1 } from "../../../../../db";
import { getSessionUser } from "../../../../auth";
import { createEmployeeInvite } from "../../../../employee-invite";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Somente administradores podem enviar convites." }, { status: 403 });

  const { id } = await context.params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) return Response.json({ error: "Funcionário inválido." }, { status: 400 });
  const d1 = await getD1();
  const employee = await d1.prepare("SELECT id, name, email, email_verified_at FROM users WHERE id = ?").bind(employeeId).first<{ id: number; name: string; email: string; email_verified_at: string | null }>();
  if (!employee) return Response.json({ error: "Funcionário não encontrado." }, { status: 404 });
  if (employee.email_verified_at) return Response.json({ error: "Este funcionário já possui acesso ativo." }, { status: 400 });

  const mail = await createEmployeeInvite({
    d1,
    userId: employee.id,
    name: employee.name,
    email: employee.email,
    origin: new URL(request.url).origin,
  });
  return Response.json({ message: "Convite reenviado.", previewUrl: mail.previewUrl });
}
