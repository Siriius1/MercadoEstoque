export function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

export function normalizeFullName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function isValidFullName(value: unknown) {
  const parts = normalizeFullName(value).split(" ").filter(Boolean);
  // Exigimos ao menos nome e sobrenome, aceitando acentos, hifens e apóstrofos.
  return parts.length >= 2 && parts.every(part => /^[\p{L}][\p{L}'’-]*$/u.test(part));
}

export function formatPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatDocument(value: unknown) {
  // Mantemos somente os 14 dígitos possíveis de um CNPJ.
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  if (!digits) return "";

  // Até 11 dígitos, o campo se comporta como CPF: 000.000.000-00.
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  // A partir do 12º dígito, muda para CNPJ: 00.000.000/0000-00.
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidDocument(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  // Letras são rejeitadas mesmo quando existem 11 ou 14 números no texto.
  if (!/^[\d.\-/\s]+$/.test(text)) return false;
  const length = text.replace(/\D/g, "").length;
  return length === 11 || length === 14;
}

export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
