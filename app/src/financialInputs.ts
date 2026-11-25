export function localToday() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}

export function normalizeUsdAmount(value: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  if (whole.length > 12 || (whole.length === 12 && whole > '999999999999')) return null;
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const negative = match[1] && (whole !== '0' || fraction !== '00') ? '-' : '';
  return negative + whole + '.' + fraction;
}
