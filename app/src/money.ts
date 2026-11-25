export function toCents(amount: string | number) {
  if (typeof amount === 'number') {
    // A single stored amount fits within safe integer cents.
    return BigInt(Math.round(amount * 100));
  }
  const negative = amount.startsWith('-');
  const [whole, fraction = ''] = (negative ? amount.slice(1) : amount).split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function formatUsd(cents: bigint) {
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  return (negative ? '-$' : '$') + (magnitude / 100n).toLocaleString('en-US') + '.' +
    String(magnitude % 100n).padStart(2, '0');
}
