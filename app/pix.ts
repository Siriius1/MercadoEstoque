export type PixKeyType = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

export type PixSettings = {
  enabled: boolean;
  keyType: PixKeyType;
  key: string;
  receiverName: string;
  city: string;
  updatedAt?: string | null;
};

export const emptyPixSettings: PixSettings = {
  enabled: false,
  keyType: "cnpj",
  key: "",
  receiverName: "",
  city: "",
};

function onlyAscii(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

export function normalizePixKey(type: PixKeyType, value: unknown) {
  const text = String(value ?? "").trim();
  if (type === "cpf" || type === "cnpj") return text.replace(/\D/g, "");
  if (type === "email") return text.toLowerCase().replace(/\s+/g, "");
  if (type === "telefone") {
    const digits = text.replace(/\D/g, "");
    return `+${digits.startsWith("55") ? digits : `55${digits}`}`.slice(0, 14);
  }
  return text.replace(/\s+/g, "").slice(0, 77);
}

export function validatePixSettings(settings: PixSettings) {
  if (!settings.enabled) return "";
  const key = normalizePixKey(settings.keyType, settings.key);
  const keyIsValid =
    (settings.keyType === "cpf" && /^\d{11}$/.test(key)) ||
    (settings.keyType === "cnpj" && /^\d{14}$/.test(key)) ||
    (settings.keyType === "telefone" && /^\+55\d{10,11}$/.test(key)) ||
    (settings.keyType === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(key)) ||
    (settings.keyType === "aleatoria" && /^[A-Za-z0-9-]{8,77}$/.test(key));
  if (!keyIsValid) return "Informe uma chave PIX válida para o tipo selecionado.";
  if (onlyAscii(settings.receiverName, 25).length < 2) return "Informe o nome do recebedor.";
  if (onlyAscii(settings.city, 15).length < 2) return "Informe a cidade do recebedor.";
  return "";
}

function emvField(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(settings: PixSettings, amount?: number) {
  const error = validatePixSettings({ ...settings, enabled: true });
  if (error) throw new Error(error);

  // O BR Code é montado em campos "id + tamanho + conteúdo".
  const merchantAccount =
    emvField("00", "BR.GOV.BCB.PIX") +
    emvField("01", normalizePixKey(settings.keyType, settings.key));
  const amountField = amount && amount > 0 ? emvField("54", amount.toFixed(2)) : "";
  const additionalData = emvField("05", "***");
  const withoutCrc =
    emvField("00", "01") +
    emvField("01", "11") +
    emvField("26", merchantAccount) +
    emvField("52", "0000") +
    emvField("53", "986") +
    amountField +
    emvField("58", "BR") +
    emvField("59", onlyAscii(settings.receiverName, 25)) +
    emvField("60", onlyAscii(settings.city, 15)) +
    emvField("62", additionalData) +
    "6304";
  return `${withoutCrc}${crc16(withoutCrc)}`;
}
