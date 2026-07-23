"use client";

import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register" | "forgot" | "reset" | "verify";

const normalizeEmailInput = (value: string) => value.toLowerCase().replace(/\s+/g, "");

export default function AuthScreen({ initialMode, token }: { initialMode: Mode; token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(initialMode === "verify");
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (initialMode !== "verify") return;
    void request("/api/auth/verify", { token });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, token]);

  async function request(endpoint: string, payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage(""); setPreviewUrl("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string; previewUrl?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      if (endpoint.endsWith("/login")) { window.location.href = "/"; return; }
      setMessage(result.message ?? "Concluído com sucesso.");
      setPreviewUrl(result.previewUrl ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const password = String(data.password ?? "");
    const confirmation = String(data.confirmation ?? "");
    if ((initialMode === "register" || initialMode === "reset") && password !== confirmation) {
      setError("As senhas não são iguais.");
      return;
    }
    const endpoint = initialMode === "register" ? "/api/auth/register" : initialMode === "forgot" ? "/api/auth/forgot-password" : initialMode === "reset" ? "/api/auth/reset-password" : "/api/auth/login";
    await request(endpoint, { ...data, token });
  }

  const title = initialMode === "register" ? "Criar sua conta" : initialMode === "forgot" ? "Recuperar senha" : initialMode === "reset" ? "Criar nova senha" : initialMode === "verify" ? "Confirmar e-mail" : "Acessar o sistema";
  const description = initialMode === "register" ? "Cadastre-se para administrar o estoque com segurança." : initialMode === "forgot" ? "Enviaremos um link seguro para o seu e-mail." : initialMode === "reset" ? "Escolha uma nova senha para sua conta." : initialMode === "verify" ? "Estamos validando o link enviado ao seu e-mail." : "Entre com seu e-mail e sua senha.";

  return <main className="auth-page">
    <section className="auth-brand">
      <div className="auth-logo"><span>+</span> Mercado+</div>
      <small>GESTÃO DE ESTOQUE</small>
      <h1>Seu estoque protegido e sempre organizado.</h1>
      <p>Acesse produtos, fornecedores, movimentações e relatórios em um único lugar.</p>
      <div className="auth-security"><b>✓</b><span><strong>Acesso seguro</strong><small>Senhas protegidas e sessões privadas</small></span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <span className="auth-eyebrow">BEM-VINDO AO MERCADO+</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {initialMode === "verify" ? <div className="auth-result">{busy ? "Confirmando..." : message || error}</div> :
          <form onSubmit={submit}>
            {initialMode === "register" && <label>Nome completo<input name="name" required autoComplete="name" placeholder="Seu nome"/></label>}
            {(initialMode === "login" || initialMode === "register" || initialMode === "forgot") && <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" onInput={event => { event.currentTarget.value = normalizeEmailInput(event.currentTarget.value); }}/></label>}
            {(initialMode === "login" || initialMode === "register" || initialMode === "reset") && <label>Senha<input name="password" type="password" required minLength={8} autoComplete={initialMode === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres"/></label>}
            {(initialMode === "register" || initialMode === "reset") && <label>Confirmar senha<input name="confirmation" type="password" required minLength={8} autoComplete="new-password" placeholder="Digite a senha novamente"/></label>}
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            {previewUrl && <a className="auth-preview" href={previewUrl}>Abrir e-mail de teste local →</a>}
            <button className="auth-submit" disabled={busy}>{busy ? "Aguarde..." : initialMode === "register" ? "Criar conta" : initialMode === "forgot" ? "Enviar link" : initialMode === "reset" ? "Alterar senha" : "Entrar"}</button>
          </form>}
        <div className="auth-links">
          {initialMode === "login" && <><a href="/?auth=forgot">Esqueci minha senha</a><span>Não possui uma conta? <a href="/?auth=register">Criar conta</a></span></>}
          {initialMode !== "login" && <a href="/">← Voltar para o login</a>}
        </div>
      </div>
    </section>
  </main>;
}
