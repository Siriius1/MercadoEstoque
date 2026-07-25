"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { maskEmail, normalizeEmail } from "./validation";

type Employee = {
  id: number;
  name: string;
  email: string;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function roleLabel(role: string) {
  return role === "admin" ? "Administrador" : "Operador de caixa";
}

export default function EmployeesSection({ currentUser }: { currentUser: { email: string; role: string } }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/employees");
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Não foi possível carregar os funcionários.");
      setLoading(false);
      return;
    }
    setEmployees(result.employees);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => employees.filter(employee =>
    `${employee.name} ${employee.email} ${roleLabel(employee.role)}`.toLowerCase().includes(search.toLowerCase())
  ), [employees, search]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(editing ? `/api/employees/${editing.id}` : "/api/employees", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Não foi possível salvar o funcionário.");
      return;
    }
    setEditing(undefined);
    setNotice(editing ? "Funcionário atualizado." : "Funcionário cadastrado e liberado para acessar.");
    await load();
  }

  async function remove(employee: Employee) {
    if (!window.confirm(`Excluir o acesso de ${employee.name}?`)) return;
    const response = await fetch(`/api/employees/${employee.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Não foi possível excluir o funcionário.");
      return;
    }
    setNotice("Funcionário excluído.");
    await load();
  }

  if (currentUser.role !== "admin") {
    return <><div className="page-heading"><div><small>EQUIPE</small><h1>Funcionários</h1><p>Gerencie quem pode acessar o Mercado+.</p></div></div><article className="panel employee-restricted"><span>◆</span><h2>Acesso restrito</h2><p>Somente administradores podem visualizar e gerenciar funcionários.</p></article></>;
  }

  return <>
    <div className="page-heading">
      <div><small>EQUIPE</small><h1>Funcionários</h1><p>Cadastre e gerencie os acessos da sua equipe.</p></div>
      <button className="primary" onClick={() => { setError(""); setEditing(null); }}>+ Novo funcionário</button>
    </div>
    {notice && <div className="employee-notice">{notice}</div>}
    {error && editing === undefined && <p className="form-error">{error}</p>}
    <div className="toolbar">
      <label className="search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar funcionário, e-mail ou função..." /></label>
      <span>{filtered.length} funcionário(s)</span>
    </div>
    <article className="table-card employee-table">
      <table>
        <thead><tr><th>Funcionário</th><th>E-mail</th><th>Função</th><th>Conta</th><th>Cadastro</th><th></th></tr></thead>
        <tbody>{filtered.map(employee => <tr key={employee.id}>
          <td><div className="product-cell"><span className="mini-avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><small>{employee.email === currentUser.email ? "Você" : "Membro da equipe"}</small></div></div></td>
          <td>{maskEmail(employee.email)}</td>
          <td><span className={`employee-role ${employee.role}`}>{roleLabel(employee.role)}</span></td>
          <td><span className={`status ${employee.emailVerifiedAt ? "ok" : "low"}`}>{employee.emailVerifiedAt ? "Liberada" : "Pendente"}</span></td>
          <td>{new Intl.DateTimeFormat("pt-BR").format(new Date(employee.createdAt.replace(" ", "T") + (employee.createdAt.includes("Z") ? "" : "Z")))}</td>
          <td><div className="row-actions"><button onClick={() => { setError(""); setEditing(employee); }} title="Editar funcionário">✎</button><button className="delete-button" disabled={employee.email === currentUser.email} onClick={() => void remove(employee)} title={employee.email === currentUser.email ? "Você não pode excluir sua própria conta" : "Excluir funcionário"}>Excluir</button></div></td>
        </tr>)}</tbody>
      </table>
      {!loading && !filtered.length && <div className="empty"><span>♙</span><p>Nenhum funcionário encontrado.</p></div>}
      {loading && <div className="loading-card">Carregando equipe...</div>}
    </article>
    {editing !== undefined && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(undefined); }}>
      <div className="modal">
        <button className="modal-close" onClick={() => setEditing(undefined)}>×</button>
        <small>Mercado+</small>
        <h2>{editing ? "Editar funcionário" : "Novo funcionário"}</h2>
        <p>{editing ? "Atualize os dados e as permissões desta conta." : "Crie o acesso que o funcionário usará para entrar no sistema."}</p>
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="span-2">Nome completo<input name="name" required minLength={2} defaultValue={editing?.name} /></label>
            <label>E-mail<input name="email" type="email" required defaultValue={editing?.email} onBlur={event => { event.currentTarget.value = normalizeEmail(event.currentTarget.value); }} /></label>
            <label>Função<select name="role" required defaultValue={editing?.role || "cashier"}><option value="cashier">Operador de caixa</option><option value="admin">Administrador</option></select></label>
            <label className="span-2">{editing ? "Nova senha (opcional)" : "Senha inicial"}<input name="password" type="password" minLength={8} required={!editing} autoComplete="new-password" placeholder={editing ? "Deixe vazio para manter a senha atual" : "Mínimo de 8 caracteres"} /></label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setEditing(undefined)}>Cancelar</button><button className="primary" type="submit">Salvar funcionário</button></div>
        </form>
      </div>
    </div>}
  </>;
}
