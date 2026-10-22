import type { PayRate, Shift, Transaction, Workplace } from '../types';
import { cycleForPaymentMonth, type BillingCycle } from './billing';
import { weekdayOf } from './date';
import { holidayName } from './holidays';
import { compareShifts, shiftSpan } from './shift';

const MINUTES_PER_DAY = 24 * 60;

/** 深夜の時間帯 (22:00〜翌5:00)。勤務日の 0:00 からの分 */
const NIGHT_START = 22 * 60;
const NIGHT_END = 29 * 60;

/** 1 日にこれを超えて働いた分を残業とする (労働基準法の 1 日 8 時間) */
export const DAILY_REGULAR_MINUTES = 8 * 60;

/**
 * 金額は「時給 × 分 × 率 (%)」の整数で積み上げ、最後に円へ丸める。
 * 1 円 = 60 分 × 100% なので、この単位の 6000 が 1 円にあたる。
 */
const UNITS_PER_YEN = 60 * 100;

const toYen = (units: number) => Math.round(units / UNITS_PER_YEN);

/**
 * 勤務先を作ったときの時給の設定の適用開始日 (「最初から」の意味)。
 * 作った日にすると、あとからそれより前の日付で時給の変更を入れたときに新旧が逆転するため
 */
export const FIRST_RATE_START_DATE = '2000-01-01';

/** 勤務先ごとの時給の設定を、適用開始日の古い順に並べる */
export function groupRatesByWorkplace(rates: PayRate[]): Map<string, PayRate[]> {
  const groups = new Map<string, PayRate[]>();
  for (const rate of rates) {
    const list = groups.get(rate.workplaceId) ?? [];
    list.push(rate);
    groups.set(rate.workplaceId, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  return groups;
}

/**
 * その日に使う時給・交通費の設定。sortedRates は適用開始日の古い順。
 * どの設定よりも前の日には、最も古い設定を使う。
 */
export function rateOn(sortedRates: PayRate[], date: string): PayRate | undefined {
  let found = sortedRates[0];
  for (const rate of sortedRates) {
    if (rate.startDate <= date) found = rate;
  }
  return found;
}

/** 祝日 → 土曜・日曜 → 基本の順に、設定のある時給を使う */
export function wageOn(rate: PayRate, date: string): number {
  if (rate.holidayWage != null && holidayName(date)) return rate.holidayWage;
  const weekday = weekdayOf(date);
  if (weekday === 6 && rate.saturdayWage != null) return rate.saturdayWage;
  if (weekday === 0 && rate.sundayWage != null) return rate.sundayWage;
  return rate.hourlyWage;
}

/**
 * 休憩を除いた勤務の時間帯 ([開始, 終了) の分の組)。
 * 休憩は分数だけを記録するので、勤務時間の真ん中に取ったものとみなす。
 */
export function workIntervals(shift: Shift): [number, number][] {
  const { start, end } = shiftSpan(shift);
  const breakMinutes = Math.min(shift.breakMinutes, end - start);
  if (breakMinutes <= 0) return [[start, end]];
  const breakStart = start + Math.floor((end - start - breakMinutes) / 2);
  return (
    [
      [start, breakStart],
      [breakStart + breakMinutes, end],
    ] as [number, number][]
  ).filter(([from, to]) => to > from);
}

/** 深夜 (22:00〜翌5:00) にかかる分数。前日の夜から続く 0:00〜5:00 も含める */
function nightMinutesOf(intervals: [number, number][]): number {
  let total = 0;
  for (const [from, to] of intervals) {
    for (let day = -1; day <= 1; day++) {
      const nightFrom = NIGHT_START + day * MINUTES_PER_DAY;
      const nightTo = NIGHT_END + day * MINUTES_PER_DAY;
      total += Math.max(0, Math.min(to, nightTo) - Math.max(from, nightFrom));
    }
  }
  return total;
}

export interface ShiftPay {
  shift: Shift;
  /** 適用した時給。勤務先や時給の設定が見つからなければ 0 */
  wage: number;
  workedMinutes: number;
  /** 深夜に働いた分 (残業と重なる分も含む) */
  nightMinutes: number;
  /** 1 日 8 時間を超えた分 (深夜と重なる分も含む) */
  overtimeMinutes: number;
  /** 以下は 1/6000 円単位。深夜と残業が重なる分は両方の割増が付く */
  baseUnits: number;
  nightUnits: number;
  overtimeUnits: number;
}

/**
 * シフトごとの勤務時間と給料を求める。
 * 残業は勤務先・勤務日ごとに 8 時間を超えた分とし、同じ日に複数のシフトがあれば
 * 開始の早い順に積み上げる。正しく求めるには、同じ日のシフトをまとめて渡すこと。
 */
export function calculateShiftPays(
  shifts: Shift[],
  workplaceById: Map<string, Workplace>,
  ratesByWorkplace: Map<string, PayRate[]>,
): Map<string, ShiftPay> {
  const result = new Map<string, ShiftPay>();
  const workedSoFar = new Map<string, number>();

  for (const shift of [...shifts].sort(compareShifts)) {
    const workplace = workplaceById.get(shift.workplaceId);
    const rate = rateOn(ratesByWorkplace.get(shift.workplaceId) ?? [], shift.date);
    const wage = rate ? wageOn(rate, shift.date) : 0;

    const intervals = workIntervals(shift);
    const worked = intervals.reduce((sum, [from, to]) => sum + to - from, 0);
    const night = nightMinutesOf(intervals);

    const dayKey = `${shift.workplaceId}|${shift.date}`;
    const before = workedSoFar.get(dayKey) ?? 0;
    workedSoFar.set(dayKey, before + worked);
    const overtime =
      Math.max(0, before + worked - DAILY_REGULAR_MINUTES) -
      Math.max(0, before - DAILY_REGULAR_MINUTES);

    result.set(shift.id, {
      shift,
      wage,
      workedMinutes: worked,
      nightMinutes: night,
      overtimeMinutes: overtime,
      baseUnits: wage * 100 * worked,
      nightUnits: wage * (workplace?.nightPremiumPercent ?? 0) * night,
      overtimeUnits: wage * (workplace?.overtimePremiumPercent ?? 0) * overtime,
    });
  }
  return result;
}

export interface PaySummary {
  /** 出勤した日数 (同じ日に複数の勤務先へ行っても 1 日) */
  days: number;
  workedMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  basePay: number;
  nightPay: number;
  overtimePay: number;
  /** 交通費。勤務先ごとに、出勤した日の数だけ 1 日分を足す */
  transportFee: number;
  total: number;
}

/** 複数のシフトの合計。各項目を円に丸めてから足すので、内訳の合計と total が一致する */
export function summarizePays(
  pays: ShiftPay[],
  ratesByWorkplace: Map<string, PayRate[]>,
): PaySummary {
  const dates = new Set<string>();
  const workplaceDays = new Set<string>();
  let transportFee = 0;
  let workedMinutes = 0;
  let nightMinutes = 0;
  let overtimeMinutes = 0;
  let baseUnits = 0;
  let nightUnits = 0;
  let overtimeUnits = 0;

  for (const pay of pays) {
    const { workplaceId, date } = pay.shift;
    dates.add(date);
    const dayKey = `${workplaceId}|${date}`;
    if (!workplaceDays.has(dayKey)) {
      workplaceDays.add(dayKey);
      transportFee += rateOn(ratesByWorkplace.get(workplaceId) ?? [], date)?.transportFee ?? 0;
    }
    workedMinutes += pay.workedMinutes;
    nightMinutes += pay.nightMinutes;
    overtimeMinutes += pay.overtimeMinutes;
    baseUnits += pay.baseUnits;
    nightUnits += pay.nightUnits;
    overtimeUnits += pay.overtimeUnits;
  }

  const basePay = toYen(baseUnits);
  const nightPay = toYen(nightUnits);
  const overtimePay = toYen(overtimeUnits);
  return {
    days: dates.size,
    workedMinutes,
    nightMinutes,
    overtimeMinutes,
    basePay,
    nightPay,
    overtimePay,
    transportFee,
    total: basePay + nightPay + overtimePay + transportFee,
  };
}

/** 1 件のシフトの見込み額 (交通費を除く) */
export function shiftPayYen(pay: ShiftPay): number {
  return toYen(pay.baseUnits + pay.nightUnits + pay.overtimeUnits);
}

export interface Payroll {
  workplace: Workplace;
  /** 給料日と対象期間 */
  cycle: BillingCycle;
  /** 対象期間のシフト (日付・開始の順) */
  pays: ShiftPay[];
  summary: PaySummary;
}

/** その勤務先・支給月の給料として記録した取引 */
export function salaryRecordsFor(
  transactions: Transaction[],
  workplaceId: string,
  payMonth: string,
): Transaction[] {
  return transactions.filter(
    (t) => t.workplaceId === workplaceId && t.payMonth === payMonth,
  );
}

/**
 * 給料日を過ぎたのに、まだ収入として記録していない給料。
 * 見込みはシフトの変更で変わりうるので、給料日が来るまでは知らせない。
 */
export function pendingPayrolls(
  payrolls: Payroll[],
  salaryTransactions: Transaction[],
  today: string,
): Payroll[] {
  return payrolls.filter(
    (payroll) =>
      payroll.summary.total > 0 &&
      payroll.cycle.paymentDate <= today &&
      salaryRecordsFor(
        salaryTransactions,
        payroll.workplace.id,
        payroll.cycle.paymentYearMonth,
      ).length === 0,
  );
}

/** 勤務先の、指定した支給月の給料の見込み */
export function payrollFor(
  workplace: Workplace,
  paymentYearMonth: string,
  shiftPays: Map<string, ShiftPay>,
  ratesByWorkplace: Map<string, PayRate[]>,
): Payroll {
  const cycle = cycleForPaymentMonth(workplace, paymentYearMonth);
  const pays = [...shiftPays.values()]
    .filter(
      ({ shift }) =>
        shift.workplaceId === workplace.id &&
        shift.date >= cycle.periodStart &&
        shift.date <= cycle.periodEnd,
    )
    .sort((a, b) => compareShifts(a.shift, b.shift));
  return { workplace, cycle, pays, summary: summarizePays(pays, ratesByWorkplace) };
}
