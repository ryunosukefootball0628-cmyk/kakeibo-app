const formatter = new Intl.NumberFormat('ja-JP');

export function formatYen(amount: number): string {
  return `¥${formatter.format(amount)}`;
}

export function formatSignedYen(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}¥${formatter.format(Math.abs(amount))}`;
}
