/**
 * Приводит телефон к формату E.164 без плюса (380XXXXXXXXX).
 * Украинские номера в локальной записи (0XXXXXXXXX) дополняются кодом страны.
 * Возвращает null, если в строке нет похожего на номер.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10 && digits.startsWith('0')) digits = '38' + digits;
  if (digits.length === 11 && digits.startsWith('80')) digits = '3' + digits;
  if (digits.length === 9 && !digits.startsWith('0')) digits = '380' + digits;
  return digits;
}

export function formatPhone(normalized: string): string {
  if (normalized.startsWith('380') && normalized.length === 12) {
    return `+380 ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8, 10)} ${normalized.slice(10)}`;
  }
  return '+' + normalized;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : null;
}
