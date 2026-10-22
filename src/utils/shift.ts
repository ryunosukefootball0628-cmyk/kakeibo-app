import type { Shift } from '../types';

/** 時刻は HH:MM で保存する */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const MINUTES_PER_DAY = 24 * 60;

/** "HH:MM" を 0:00 からの分に直す */
export function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 0:00 からの分を "H:MM" で表す (24 時を超えたら翌日の時刻) */
export function formatClock(minutes: number): string {
  const inDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${Math.floor(inDay / 60)}:${String(inDay % 60).padStart(2, '0')}`;
}

type TimeRange = Pick<Shift, 'startTime' | 'endTime'>;

/**
 * 勤務日の 0:00 からの開始・終了 (分)。終了が開始より前か同じなら翌日の時刻とみなすので、
 * end は 1440 を超えることがある。
 */
export function shiftSpan(range: TimeRange): { start: number; end: number } {
  const start = parseTime(range.startTime);
  let end = parseTime(range.endTime);
  if (end <= start) end += MINUTES_PER_DAY;
  return { start, end };
}

/** 休憩を除いた勤務時間 (分) */
export function workedMinutesOf(shift: TimeRange & Pick<Shift, 'breakMinutes'>): number {
  const { start, end } = shiftSpan(shift);
  return Math.max(0, end - start - shift.breakMinutes);
}

/** "9:00〜17:00"。日をまたぐなら "22:00〜翌2:00" */
export function timeRangeLabel(range: TimeRange): string {
  const { start, end } = shiftSpan(range);
  const nextDay = end > MINUTES_PER_DAY ? '翌' : '';
  return `${formatClock(start)}〜${nextDay}${formatClock(end)}`;
}

/** "7時間30分" */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 同じ日のシフトを開始の早い順に並べる */
export function compareShifts(a: Shift, b: Shift): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}
