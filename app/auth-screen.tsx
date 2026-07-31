"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Mode = "login" | "register" | "forgot" | "reset" | "verify" | "invite" | "pending" | "approve" | "reject";

const normalizeEmailInput = (value: string) => value.toLowerCase().replace(/\s+/g, "");

type GoogleAccounts = { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void; renderButton: (element: HTMLElement, options: Record<string, string | number>) => void } };

declare global {
  interface Window { google?: { accounts: GoogleAccounts } }
}

export default function AuthScreen({ initialMode, token, googleClientId, registrationOpen, welcome }: { initialMode: Mode; token: string; googleClientId: string; registrationOpen: boolean; welcome: string }) {
  const welcomeMessage = welcome === "approved" ? "Seu cadastro foi aprovado. Sua empresa está pronta para receber você." : welcome === "1" ? "Acesso ativado. Entre com sua nova senha ou com o Google." : "";
  const [message, setMessage] = useState(welcomeMessage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(["verify", "approve", "reject"].includes(initialMode));
  const [previewUrl, setPreviewUrl] = useState("");
  const [rejectPreviewUrl, setRejectPreviewUrl] = useState("");
  const [pendingApproval, setPendingApproval] = useState(initialMode === "pending");
  const googleButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMode !== "verify") return;
    void request("/api/auth/verify", { token });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, token]);

  useEffect(() => {
    if (initialMode !== "approve" && initialMode !== "reject") return;
    void request("/api/auth/review-registration", { token, action: initialMode });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, token]);

  useEffect(() => {
    if (initialMode !== "login" || !googleClientId) return;
    const render = () => {
      if (!window.google || !googleButton.current) return;
      googleButton.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: response => { void request("/api/auth/google", { credential: response.credential }); },
      });
      window.google.accounts.id.renderButton(googleButton.current, { type: "standard", theme: "outline", size: "large", shape: "rectangular", text: "continue_with", logo_alignment: "left", width: 342 });
    };
    if (window.google) { render(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) { existing.addEventListener("load", render, { once: true }); return () => existing.removeEventListener("load", render); }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => { script.onload = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, googleClientId]);

  async function request(endpoint: string, payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage(""); setPreviewUrl("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string; previewUrl?: string; rejectPreviewUrl?: string; status?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      if (endpoint.endsWith("/login") || endpoint.endsWith("/google")) { window.location.href = "/"; return; }
      if (endpoint.endsWith("/accept-invite")) { window.location.href = "/?auth=login&welcome=1"; return; }
      setMessage(result.message ?? "Concluído com sucesso.");
      setPreviewUrl(result.previewUrl ?? "");
      setRejectPreviewUrl(result.rejectPreviewUrl ?? "");
      if (endpoint.endsWith("/register") && result.status === "pending") setPendingApproval(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  if (pendingApproval) return <main className="approval-wait-page">
    <section className="approval-wait-card">
      <div className="approval-orbit" aria-hidden="true"><i/><i/><i/><span>+</span></div>
      <span className="approval-eyebrow">SOLICITAÇÃO ENVIADA</span>
      <h1>Seu espaço está quase pronto.</h1>
      <p>Recebemos seu cadastro e ele já está aguardando a autorização do responsável pelo Mercado+.</p>
      <div className="approval-steps">
        <div className="done"><b>✓</b><span><strong>Solicitação recebida</strong><small>Seus dados foram protegidos.</small></span></div>
        <div className="active"><b>2</b><span><strong>Em análise</strong><small>O responsável recebeu um e-mail.</small></span></div>
        <div><b>3</b><span><strong>Liberação do acesso</strong><small>Você receberá a resposta por e-mail.</small></span></div>
      </div>
      <p className="approval-note"><span/>É seguro fechar esta página. Avisaremos assim que houver uma decisão.</p>
      {previewUrl && <div className="approval-local-test"><small>TESTE LOCAL</small><p>Como o envio real ainda não está ativo, use estes links para testar o fluxo:</p><div><a href={previewUrl}>Aprovar solicitação</a>{rejectPreviewUrl && <a className="reject" href={rejectPreviewUrl}>Recusar</a>}</div></div>}
      <a className="approval-back" href="/">← Voltar para o login</a>
    </section>
  </main>;

  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível abrir a demonstração.");
      window.location.href = "/";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir a demonstração.");
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const password = String(data.password ?? "");
    const confirmation = String(data.confirmation ?? "");
    if ((initialMode === "register" || initialMode === "reset" || initialMode === "invite") && password !== confirmation) {
      setError("As senhas não são iguais.");
      return;
    }
    const endpoint = initialMode === "register" ? "/api/auth/register" : initialMode === "forgot" ? "/api/auth/forgot-password" : initialMode === "reset" ? "/api/auth/reset-password" : initialMode === "invite" ? "/api/auth/accept-invite" : "/api/auth/login";
    await request(endpoint, { ...data, token });
  }

  const reviewing = initialMode === "approve" || initialMode === "reject";
  const title = initialMode === "register" ? "Solicitar sua conta" : initialMode === "forgot" ? "Recuperar senha" : initialMode === "reset" ? "Criar nova senha" : initialMode === "invite" ? "Ativar meu acesso" : initialMode === "verify" ? "Confirmar e-mail" : reviewing ? "Analisando solicitação" : "Acessar o sistema";
  const description = initialMode === "register" ? "Preencha seus dados para solicitar a criação do seu estabelecimento." : initialMode === "forgot" ? "Enviaremos um link seguro para o seu e-mail." : initialMode === "reset" ? "Escolha uma nova senha para sua conta." : initialMode === "invite" ? "Você foi convidado para a equipe. Defina sua senha pessoal." : initialMode === "verify" ? "Estamos validando o link enviado ao seu e-mail." : reviewing ? "Estamos registrando sua decisão com segurança." : "Entre com seu e-mail e sua senha.";

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
        {initialMode === "login" && <>
          <button className="auth-demo-button" type="button" disabled={busy} onClick={enterDemo}>
            <strong>Testar demonstração</strong>
            <small>Acesso completo de administrador, sem cadastro</small>
          </button>
          <div className="auth-divider"><span>ou acesse sua conta</span></div>
          <div className="google-login">{googleClientId ? <div ref={googleButton}/> : <button type="button" disabled title="Falta configurar o identificador do Google">Continuar com Google</button>}</div>
          <div className="auth-divider"><span>ou entre com e-mail</span></div>
        </>}
        {(initialMode === "verify" || reviewing) ? <><div className={`auth-result ${error ? "error" : ""}`}>{busy ? "Processando..." : message || error}</div>{previewUrl && <a className="auth-preview" href={previewUrl}>Abrir e-mail de resposta local →</a>}</> :
          <form onSubmit={submit}>
            {initialMode === "register" && <label>Nome completo<input name="name" required autoComplete="name" placeholder="Seu nome"/></label>}
            {(initialMode === "login" || initialMode === "register" || initialMode === "forgot") && <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com.br" onInput={event => { event.currentTarget.value = normalizeEmailInput(event.currentTarget.value); }}/></label>}
            {(initialMode === "login" || initialMode === "register" || initialMode === "reset" || initialMode === "invite") && <label>Senha<input name="password" type="password" required minLength={8} autoComplete={initialMode === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres"/></label>}
            {(initialMode === "register" || initialMode === "reset" || initialMode === "invite") && <label>Confirmar senha<input name="confirmation" type="password" required minLength={8} autoComplete="new-password" placeholder="Digite a senha novamente"/></label>}
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            {previewUrl && <a className="auth-preview" href={previewUrl}>Abrir e-mail de teste local →</a>}
            <button className="auth-submit" disabled={busy}>{busy ? "Aguarde..." : initialMode === "register" ? "Solicitar cadastro" : initialMode === "forgot" ? "Enviar link" : initialMode === "reset" ? "Alterar senha" : initialMode === "invite" ? "Ativar acesso" : "Entrar"}</button>
          </form>}
        <div className="auth-links">
          {initialMode === "login" && <><a href="/?auth=forgot">Esqueci minha senha</a>{registrationOpen && <span>Primeiro acesso? <a href="/?auth=register">Criar conta do proprietário</a></span>}</>}
          {initialMode !== "login" && <a href="/">← Voltar para o login</a>}
        </div>
      </div>
    </section>
  </main>;
}
