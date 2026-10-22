/**
 * 日本の祝日。通信先を Firebase に限っているため外部の API は使わず、祝日法の決まりから計算する。
 * 2020 年以降の決まりにもとづく (それより前の年は今の決まりで近似する)。
 * 祝日法が改正されたら、ここを直すこと。
 */

import { addDays, weekdayOf } from './date';

const pad = (n: number) => String(n).padStart(2, '0');

const cache = new Map<number, Map<string, string>>();

/** 春分日・秋分日の日付 (1980〜2099 年で使える近似式) */
function equinoxDay(year: number, base: number): number {
  const y = year - 1980;
  return Math.floor(base + 0.242194 * y - Math.floor(y / 4));
}

/** その月の第 n 月曜日 */
function nthMonday(year: number, month: number, n: number): number {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - firstWeekday) % 7) + (n - 1) * 7;
}

function holidaysOf(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const days = new Map<string, string>();
  const add = (month: number, day: number, name: string) =>
    days.set(`${year}-${pad(month)}-${pad(day)}`, name);

  add(1, 1, '元日');
  add(1, nthMonday(year, 1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  add(2, 23, '天皇誕生日');
  add(3, equinoxDay(year, 20.8431), '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  // 東京オリンピック・パラリンピックに合わせて 2020・2021 年だけ移った
  if (year === 2020) {
    add(7, 23, '海の日');
    add(7, 24, 'スポーツの日');
    add(8, 10, '山の日');
  } else if (year === 2021) {
    add(7, 22, '海の日');
    add(7, 23, 'スポーツの日');
    add(8, 8, '山の日');
  } else {
    add(7, nthMonday(year, 7, 3), '海の日');
    add(8, 11, '山の日');
    add(10, nthMonday(year, 10, 2), 'スポーツの日');
  }
  add(9, nthMonday(year, 9, 3), '敬老の日');
  add(9, equinoxDay(year, 23.2488), '秋分の日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  const holidays = new Set(days.keys());

  for (const iso of holidays) {
    // 国民の休日: 祝日にはさまれた平日 (敬老の日と秋分の日の間など)
    const next = addDays(iso, 1);
    if (!holidays.has(next) && holidays.has(addDays(iso, 2))) {
      days.set(next, '国民の休日');
    }
    // 振替休日: 祝日が日曜なら、そのあとの最初の祝日でない日
    if (weekdayOf(iso) === 0) {
      let substitute = next;
      while (holidays.has(substitute)) substitute = addDays(substitute, 1);
      days.set(substitute, '振替休日');
    }
  }

  cache.set(year, days);
  return days;
}

/** 祝日 (振替休日・国民の休日を含む) ならその名前。祝日でなければ undefined */
export function holidayName(isoDate: string): string | undefined {
  return holidaysOf(Number(isoDate.slice(0, 4))).get(isoDate);
}
