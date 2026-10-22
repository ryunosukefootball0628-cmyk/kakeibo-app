const formatter = new Intl.NumberFormat('ja-JP');

/** 保存できる金額の上限 (firestore.rules の isAmount と同じ)。超えるとサーバーで拒否される */
export const MAX_AMOUNT = 1_000_000_000_000;

export function formatYen(amount: number): string {
  return `¥${formatter.format(amount)}`;
}

/** 狭い枠に収めるための短い表記 (¥ なし)。1万以上は「1.2万」「123万」のように丸める */
export function formatCompactAmount(amount: number): string {
  const units: [number, string][] = [
    [1e8, '億'],
    [1e4, '万'],
  ];
  for (const [size, unit] of units) {
    if (amount < size) continue;
    const value = amount / size;
    // 1 桁のときだけ小数第 1 位まで出す (10.0万 のような表記は避ける)
    const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return `${rounded}${unit}`;
  }
  return formatter.format(amount);
}

export function formatSignedYen(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}¥${formatter.format(Math.abs(amount))}`;
}

/** 残高の表記。マイナスは「-¥1,000」にする (formatYen だと「¥-1,000」になる) */
export function formatBalance(amount: number): string {
  return amount < 0 ? formatSignedYen(amount) : formatYen(amount);
}
