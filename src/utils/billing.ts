import type { PaymentMethod, Transaction } from '../types';
import { addDays, addMonths, dateOfClampedDay, toYearMonth } from './date';

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

/**
 * date を対象期間に含む支払月 (cycleForPaymentMonth の逆)。
 * 締め日が 15 日・翌月払いなら、2026-10-15 は 2026-11、2026-10-16 は 2026-12 になる。
 */
export function paymentMonthOfDate(rule: ClosingRule, date: string): string {
  const month = toYearMonth(date);
  const closingYearMonth =
    date <= dateOfClampedDay(month, rule.closingDay) ? month : addMonths(month, 1);
  return addMonths(closingYearMonth, rule.paymentMonthOffset);
}

const OFFSET_LABEL = ['当月', '翌月', '翌々月'];

const dayLabel = (day: number) => (day === 31 ? '月末' : `${day}日`);

/** "月末締め / 翌月27日払い" */
export function closingRuleLabel(rule: ClosingRule): string {
  const offset = OFFSET_LABEL[rule.paymentMonthOffset] ?? `${rule.paymentMonthOffset}か月後`;
  return `${dayLabel(rule.closingDay)}締め / ${offset}${dayLabel(rule.paymentDay)}払い`;
}

/** カードの締め日・支払日の決まり。カード以外や締め日が未設定なら null */
export function cardClosingRule(method: PaymentMethod): ClosingRule | null {
  if (method.kind !== 'credit_card') return null;
  if (method.closingDay == null || method.paymentDay == null) return null;

  return {
    closingDay: method.closingDay,
    paymentDay: method.paymentDay,
    paymentMonthOffset: method.paymentMonthOffset ?? 1,
  };
}

/** 指定した支払月に請求されるカードの利用期間。カード以外や締め日が未設定なら null */
export function billingCycleForPaymentMonth(
  method: PaymentMethod,
  paymentYearMonth: string,
): BillingCycle | null {
  const rule = cardClosingRule(method);
  return rule && cycleForPaymentMonth(rule, paymentYearMonth);
}

/**
 * カードの利用を請求に入れる支払月。明細に合わせて移した月 (billingMonth) があればその月、
 * 無ければ利用日と締め日から決まる月
 */
export function billingMonthOf(transaction: Transaction, rule: ClosingRule): string {
  return transaction.billingMonth ?? paymentMonthOfDate(rule, transaction.date);
}

/** ある支払月のカードの請求 */
export interface CardBill {
  cycle: BillingCycle;
  /** 請求に入るカードの支出。ほかの月の請求から移してきた利用も含む */
  items: Transaction[];
  /** 締め日からはこの請求に入るが、明細に合わせてほかの月の請求へ移した利用 */
  movedOut: Transaction[];
  /** 請求予定額 (items の合計) */
  amount: number;
}

/**
 * 指定した支払月のカードの請求。transactions には対象期間の取引と、その月の請求へ移した
 * カードの利用 (useMovedCardTransactions) を渡す。カード以外や締め日が未設定なら null
 */
export function cardBill(
  card: PaymentMethod,
  transactions: Transaction[],
  paymentYearMonth: string,
): CardBill | null {
  const rule = cardClosingRule(card);
  if (!rule) return null;

  const expenses = transactions.filter(
    (t) => t.paymentMethodId === card.id && t.type === 'expense',
  );
  const items = expenses.filter((t) => billingMonthOf(t, rule) === paymentYearMonth);
  return {
    cycle: cycleForPaymentMonth(rule, paymentYearMonth),
    items,
    movedOut: expenses.filter(
      (t) =>
        t.billingMonth != null &&
        t.billingMonth !== paymentYearMonth &&
        paymentMonthOfDate(rule, t.date) === paymentYearMonth,
    ),
    amount: items.reduce((sum, t) => sum + t.amount, 0),
  };
}

/**
 * 日付の範囲で読んだ取引に、ほかの月の請求へ移したカードの利用 (useMovedCardTransactions) を足す。
 * 両方に入っている取引は 1 件にする
 */
export function withMovedCardTransactions(
  transactions: Transaction[],
  moved: Transaction[],
): Transaction[] {
  if (moved.length === 0) return transactions;
  const ids = new Set(transactions.map((t) => t.id));
  return [...transactions, ...moved.filter((t) => !ids.has(t.id))];
}
