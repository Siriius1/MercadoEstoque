"use client";

import { FormEvent, useEffect, useState } from "react";
import PixPayment from "./pix-payment";
import { emptyPixSettings, normalizePixKey, PixKeyType, PixSettings, validatePixSettings } from "./pix";
import { API_BASE } from "./api-base";

export default function PaymentSettingsSection() {
  const [settings, setSettings] = useState<PixSettings>(emptyPixSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch(`${API_BASE}/api/payment-settings/pix`)
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || result.error);
        setSettings(result.settings);
      })
      .catch(caught => setError(caught instanceof Error ? caught.message : "Não foi possível carregar o PIX."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePixSettings(settings);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_BASE}/api/payment-settings/pix`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "Não foi possível salvar.");
      setSettings(result.settings);
      setNotice("Configuração PIX salva com segurança.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <article className="panel loading-card">Carregando configuração PIX...</article>;

  return <>
    <div className="page-heading">
      <div><small>CONFIGURAÇÕES</small><h1>Pagamentos</h1><p>Defina como o estabelecimento receberá pagamentos pelo PIX.</p></div>
    </div>
    <section className="payment-settings-layout">
      <article className="panel payment-settings-card">
        <div className="panel-head"><div><h2>PIX manual</h2><p>O operador confirma o recebimento antes de concluir a venda.</p></div><label className="settings-switch"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))}/><span/><b>{settings.enabled ? "Ativo" : "Inativo"}</b></label></div>
        <form onSubmit={save}>
          <div className="form-grid">
            <label>Tipo da chave<select value={settings.keyType} onChange={event => {
              const keyType = event.target.value as PixKeyType;
              setSettings(current => ({ ...current, keyType, key: "" }));
            }}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="telefone">Telefone</option><option value="email">E-mail</option><option value="aleatoria">Chave aleatória</option></select></label>
            <label>Chave PIX<input value={settings.key} onChange={event => setSettings(current => ({ ...current, key: normalizePixKey(current.keyType, event.target.value) }))} placeholder={settings.keyType === "email" ? "contato@mercado.com.br" : settings.keyType === "telefone" ? "+5511999999999" : "Digite a chave PIX"} required={settings.enabled}/></label>
            <label>Nome do recebedor<input value={settings.receiverName} onChange={event => setSettings(current => ({ ...current, receiverName: event.target.value.slice(0, 25) }))} maxLength={25} placeholder="MERCADO EXEMPLO" required={settings.enabled}/></label>
            <label>Cidade<input value={settings.city} onChange={event => setSettings(current => ({ ...current, city: event.target.value.slice(0, 15) }))} maxLength={15} placeholder="SAO PAULO" required={settings.enabled}/></label>
          </div>
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="employee-notice">{notice}</p>}
          <div className="form-actions"><button className="primary" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar configuração"}</button></div>
        </form>
      </article>
      <article className="panel pix-preview-card">
        <div className="panel-head"><div><h2>Prévia do QR Code</h2><p>O valor exato será incluído durante cada venda.</p></div></div>
        {settings.enabled && !validatePixSettings(settings)
          ? <PixPayment settings={settings} preview/>
          : <div className="pix-preview-empty"><span>◆</span><strong>Configure e ative o PIX</strong><p>A prévia aparecerá quando os dados estiverem completos.</p></div>}
      </article>
    </section>
  </>;
}
