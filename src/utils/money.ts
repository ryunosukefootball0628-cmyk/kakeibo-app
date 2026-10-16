const formatter = new Intl.NumberFormat('ja-JP');

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
