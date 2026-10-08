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

/**
 * 指定した支払月に請求される利用期間を求める。
 *
 * 締め日が 15 日・翌月払いのカードで 2026-11 の支払いを見る場合、
 * 締め月は 2026-10 となり対象期間は 2026-09-16 〜 2026-10-15 になる。
 * 当月払い (paymentMonthOffset = 0) なら締め月は支払月と同じ 2026-11 になる。
 */
export function billingCycleForPaymentMonth(
  method: PaymentMethod,
  paymentYearMonth: string,
): BillingCycle | null {
  if (method.kind !== 'credit_card') return null;
  if (method.closingDay == null || method.paymentDay == null) return null;

  const offset = method.paymentMonthOffset ?? 1;
  const closingYearMonth = addMonths(paymentYearMonth, -offset);
  const periodEnd = dateOfClampedDay(closingYearMonth, method.closingDay);
  const previousClosing = dateOfClampedDay(
    addMonths(closingYearMonth, -1),
    method.closingDay,
  );

  return {
    paymentYearMonth,
    paymentDate: dateOfClampedDay(paymentYearMonth, method.paymentDay),
    periodStart: addDays(previousClosing, 1),
    periodEnd,
  };
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
