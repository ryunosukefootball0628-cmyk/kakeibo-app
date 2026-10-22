import type { PaymentMethod, Transaction } from '../types';
import { addDays, addMonths, dateOfClampedDay } from './date';

export interface BillingCycle {
  /** 支払いが発生する年月 (YYYY-MM) */
  paymentYearMonth: string;
  /** 実際の支払日 (YYYY-MM-DD) */
  paymentDate: string;
  /** 対象期間の開始日 (含む) */
  periodStart: string;
  /** 対象期間の終了日 = 締め日 (含む) */
  periodEnd: string;
}

/** 締め日・支払日の決まり (カードの請求と勤務先の給料で共通) */
export interface ClosingRule {
  /** 締め日 (1-31)。月末は 31 */
  closingDay: number;
  /** 支払日 (1-31)。月末は 31 */
  paymentDay: number;
  /** 締め月から支払月までの差。0 = 当月, 1 = 翌月, 2 = 翌々月 */
  paymentMonthOffset: number;
}

/**
 * 指定した支払月に支払う分の対象期間を求める。
 *
 * 締め日が 15 日・翌月払いで 2026-11 の支払いを見る場合、
 * 締め月は 2026-10 となり対象期間は 2026-09-16 〜 2026-10-15 になる。
 * 当月払い (paymentMonthOffset = 0) なら締め月は支払月と同じ 2026-11 になる。
 */
export function cycleForPaymentMonth(
  rule: ClosingRule,
  paymentYearMonth: string,
): BillingCycle {
  const closingYearMonth = addMonths(paymentYearMonth, -rule.paymentMonthOffset);
  const periodEnd = dateOfClampedDay(closingYearMonth, rule.closingDay);
  const previousClosing = dateOfClampedDay(
    addMonths(closingYearMonth, -1),
    rule.closingDay,
  );

  return {
    paymentYearMonth,
    paymentDate: dateOfClampedDay(paymentYearMonth, rule.paymentDay),
    periodStart: addDays(previousClosing, 1),
    periodEnd,
  };
}

const OFFSET_LABEL = ['当月', '翌月', '翌々月'];

const dayLabel = (day: number) => (day === 31 ? '月末' : `${day}日`);

/** "月末締め / 翌月27日払い" */
export function closingRuleLabel(rule: ClosingRule): string {
  const offset = OFFSET_LABEL[rule.paymentMonthOffset] ?? `${rule.paymentMonthOffset}か月後`;
  return `${dayLabel(rule.closingDay)}締め / ${offset}${dayLabel(rule.paymentDay)}払い`;
}

/** 指定した支払月に請求されるカードの利用期間。カード以外や締め日が未設定なら null */
export function billingCycleForPaymentMonth(
  method: PaymentMethod,
  paymentYearMonth: string,
): BillingCycle | null {
  if (method.kind !== 'credit_card') return null;
  if (method.closingDay == null || method.paymentDay == null) return null;

  return cycleForPaymentMonth(
    {
      closingDay: method.closingDay,
      paymentDay: method.paymentDay,
      paymentMonthOffset: method.paymentMonthOffset ?? 1,
    },
    paymentYearMonth,
  );
}

export function sumTransactionsInPeriod(
  transactions: Transaction[],
  methodId: string,
  periodStart: string,
  periodEnd: string,
): number {
  return transactions
    .filter(
      (t) =>
        t.paymentMethodId === methodId &&
        t.type === 'expense' &&
        t.date >= periodStart &&
        t.date <= periodEnd,
    )
    .reduce((sum, t) => sum + t.amount, 0);
}
