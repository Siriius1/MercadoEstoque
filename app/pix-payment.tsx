"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { buildPixPayload, PixSettings } from "./pix";

export default function PixPayment({
  settings,
  amount,
  preview = false,
}: {
  settings: PixSettings;
  amount?: number;
  preview?: boolean;
}) {
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);
  const payload = useMemo(() => buildPixPayload(settings, amount), [settings, amount]);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, {
      width: preview ? 210 : 250,
      margin: 2,
      color: { dark: "#073f35", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then((value) => {
      if (active) setQrCode(value);
    });
    return () => { active = false; };
  }, [payload, preview]);

  async function copyPayload() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className={`pix-payment-display ${preview ? "preview" : ""}`}>
    <div className="pix-qr-frame">
      {qrCode ? <img src={qrCode} alt="QR Code PIX para pagamento" /> : <span>Gerando QR Code...</span>}
    </div>
    <div className="pix-payment-info">
      <small>RECEBEDOR</small>
      <strong>{settings.receiverName}</strong>
      <span>{settings.key}</span>
      {amount !== undefined && <b>Valor: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)}</b>}
      <button type="button" onClick={copyPayload}>{copied ? "Código copiado!" : "Copiar PIX Copia e Cola"}</button>
    </div>
  </div>;
}
