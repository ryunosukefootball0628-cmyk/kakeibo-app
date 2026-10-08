/** 日付文字列は YYYY-MM-DD、年月文字列は YYYY-MM で統一する */

const pad = (n: number) => String(n).padStart(2, '0');

export function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return formatIsoDate(new Date());
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [year, month] = ym.split('-').map(Number);
  return { year, month };
}

export function addMonths(ym: string, delta: number): string {
  const { year, month } = parseYearMonth(ym);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 日付指定が月の日数を超える場合は月末に丸める (月末締め・月末払いの表現に使う) */
export function dateOfClampedDay(ym: string, day: number): string {
  const { year, month } = parseYearMonth(ym);
  const clamped = Math.min(day, lastDayOfMonth(year, month));
  return `${year}-${pad(month)}-${pad(clamped)}`;
}

export function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return formatIsoDate(date);
}

/** 月の初日と最終日 (両端を含む) */
export function monthRange(ym: string): { start: string; end: string } {
  const { year, month } = parseYearMonth(ym);
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
  };
}

export function yearMonthLabel(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${year}年${month}月`;
}

export function dateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][
    new Date(y, m - 1, d).getDay()
  ];
  return `${m}/${d}(${weekday})`;
}

/** 直近 n ヶ月の年月を古い順に返す (指定月を含む) */
export function recentYearMonths(ym: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(ym, i - (n - 1)));
}
