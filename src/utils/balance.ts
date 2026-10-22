import type { PaymentMethod, RecurringExpense, Transaction } from '../types';
import {
  billingCycleForPaymentMonth,
  sumTransactionsInPeriod,
  type BillingCycle,
} from './billing';
import { addDays, toYearMonth, yearMonthsBetween } from './date';
import { salaryDepositAccountId, salaryRecordsFor, type Payroll } from './payroll';
import { pendingRecurrings } from './recurring';

/** 残高を入力した銀行口座 */
export type BalancedAccount = PaymentMethod & { balanceDate: string; balance: number };

export function hasBalance(method: PaymentMethod): method is BalancedAccount {
  return method.kind === 'bank' && method.balanceDate != null && method.balance != null;
}

/** カードの引き落とし口座。設定が無いか、その支払い方法が銀行口座でなくなっていれば undefined */
export function debitAccountOf(
  card: PaymentMethod,
  methodById: Map<string, PaymentMethod>,
): PaymentMethod | undefined {
  if (card.kind !== 'credit_card' || !card.debitAccountId) return undefined;
  const account = methodById.get(card.debitAccountId);
  return account?.kind === 'bank' ? account : undefined;
}

/** その口座から引き落とすカード */
export function cardsDebitedFrom(
  account: PaymentMethod,
  methods: PaymentMethod[],
): PaymentMethod[] {
  return methods.filter(
    (m) => m.kind === 'credit_card' && m.debitAccountId === account.id,
  );
}

/** 口座の入出金の中身 */
export type LedgerSource =
  | { type: 'transaction'; transaction: Transaction }
  /** カードの請求の引き落とし。額は対象期間に記録した利用額の合計 (請求予定額と同じ概算) */
  | { type: 'card'; card: PaymentMethod; cycle: BillingCycle }
  /** まだ記録していない給料の見込み */
  | { type: 'salary'; payroll: Payroll }
  /** まだ記録していない定期支出 */
  | { type: 'recurring'; recurring: RecurringExpense };

export interface LedgerItem {
  date: string;
  /** 入金はプラス、出金はマイナス (円) */
  amount: number;
  source: LedgerSource;
}

export interface LedgerEntry extends LedgerItem {
  /** この入出金のあとの残高 */
  balance: number;
}

/** 日付の古い順に並べる。同じ日は入金を先にし、日の途中で残高が一時的に下がって見えないようにする */
function compareItems(a: LedgerItem, b: LedgerItem): number {
  return a.date.localeCompare(b.date) || Number(b.amount > 0) - Number(a.amount > 0);
}

/** start の残高から順に足し引きし、それぞれのあとの残高を付ける */
function withBalances(start: number, items: LedgerItem[]): LedgerEntry[] {
  let balance = start;
  return [...items].sort(compareItems).map((item) => {
    balance += item.amount;
    return { ...item, balance };
  });
}

/**
 * カードの請求の引き落としのうち、支払日が after より後で until までのもの。
 * 請求額が 0 円の月は引き落としが無いものとして除く
 */
function cardWithdrawals(
  card: PaymentMethod,
  transactions: Transaction[],
  after: string,
  until: string,
): LedgerItem[] {
  return yearMonthsBetween(toYearMonth(after), toYearMonth(until)).flatMap((month) => {
    const cycle = billingCycleForPaymentMonth(card, month);
    if (!cycle || cycle.paymentDate <= after || cycle.paymentDate > until) return [];
    const amount = sumTransactionsInPeriod(
      transactions,
      card.id,
      cycle.periodStart,
      cycle.periodEnd,
    );
    return amount > 0
      ? [{ date: cycle.paymentDate, amount: -amount, source: { type: 'card', card, cycle } }]
      : [];
  });
}

/**
 * 口座の入出金 (記録した取引とカードの引き落とし) を古い順に並べ、それぞれのあとの残高を付ける。
 * 残高を合わせた日の入出金はその残高に含まれているので、翌日から until までを数える。
 * transactions には ledgerDataRange の期間の取引をすべて渡す
 */
export function accountLedger(
  account: BalancedAccount,
  methods: PaymentMethod[],
  transactions: Transaction[],
  until: string,
): LedgerEntry[] {
  const after = account.balanceDate;
  const records = transactions
    .filter((t) => t.paymentMethodId === account.id && t.date > after && t.date <= until)
    // 同じ日の取引は記録した順にする
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (t): LedgerItem => ({
        date: t.date,
        amount: t.type === 'income' ? t.amount : -t.amount,
        source: { type: 'transaction', transaction: t },
      }),
    );
  const cards = cardsDebitedFrom(account, methods).flatMap((card) =>
    cardWithdrawals(card, transactions, after, until),
  );
  return withBalances(account.balance, [...records, ...cards]);
}

/** date (残高を合わせた日以降) の終わりの時点の残高 */
export function balanceAt(
  account: BalancedAccount,
  ledger: LedgerEntry[],
  date: string,
): number {
  let balance = account.balance;
  for (const entry of ledger) {
    if (entry.date > date) break;
    balance = entry.balance;
  }
  return balance;
}

/**
 * 今日より後の入出金に、まだ記録していない見込み (給料・定期支出) を加えて古い順に並べ、
 * 今日の残高から足し引きした残高を付ける。
 * 見込みは残高を合わせた日より後のものだけを数える (それまでの分は合わせた残高に含まれている)。
 * 給料日などを過ぎたのに記録していないものは、今日の残高に入っていないので先頭に並ぶ
 */
export function accountOutlook(
  account: BalancedAccount,
  ledger: LedgerEntry[],
  today: string,
  forecasts: LedgerItem[],
): LedgerEntry[] {
  return withBalances(balanceAt(account, ledger, today), [
    ...forecasts.filter((item) => item.date > account.balanceDate),
    ...ledger.filter((entry) => entry.date > today),
  ]);
}

/** 見込みの入出金と、それが入る口座 */
export interface Forecast {
  accountId: string;
  item: LedgerItem;
}

/** まだ記録していない給料の見込み。振込先は給与の画面で記録するときの初期値と同じ口座 */
export function salaryForecasts(
  payrolls: Payroll[],
  salaryTransactions: Transaction[],
  methods: PaymentMethod[],
): Forecast[] {
  return payrolls
    .filter(
      ({ workplace, cycle, summary }) =>
        summary.total > 0 &&
        salaryRecordsFor(salaryTransactions, workplace.id, cycle.paymentYearMonth).length === 0,
    )
    .map((payroll) => ({
      accountId: salaryDepositAccountId(payroll.workplace.id, salaryTransactions, methods),
      item: {
        date: payroll.cycle.paymentDate,
        amount: payroll.summary.total,
        source: { type: 'salary', payroll },
      },
    }));
}

/** まだ記録していない定期支出 (months の各月の分)。transactions にはそれらの月の取引をすべて渡す */
export function recurringForecasts(
  recurrings: RecurringExpense[],
  transactions: Transaction[],
  months: string[],
): Forecast[] {
  return months.flatMap((month) =>
    pendingRecurrings(recurrings, transactions, month).map(({ recurring, date }) => ({
      accountId: recurring.paymentMethodId,
      item: { date, amount: -recurring.amount, source: { type: 'recurring', recurring } },
    })),
  );
}

/**
 * 口座の入出金を求めるのに読む取引の期間の始まり。カードの請求額は支払日より前の利用分から
 * 求めるので、合わせた日の月に支払う分の対象期間から読む (数える請求のうち最も早い。
 * その月の支払日が合わせた日以前なら 1 か月分よけいに読む)
 */
function ledgerDataStart(account: BalancedAccount, methods: PaymentMethod[]): string {
  const periodStarts = cardsDebitedFrom(account, methods).flatMap((card) => {
    const cycle = billingCycleForPaymentMonth(card, toYearMonth(account.balanceDate));
    return cycle ? [cycle.periodStart] : [];
  });
  return [addDays(account.balanceDate, 1), ...periodStarts].sort()[0];
}

/**
 * 残高を入力したすべての口座の入出金を until まで求めるのに読む取引の期間。
 * from を渡すと、その日からは必ず読む。残高を入力した口座が無ければ null (読まない)
 */
export function ledgerDataRange(
  methods: PaymentMethod[],
  until: string,
  from?: string,
): { start: string; end: string } | null {
  const starts = methods.filter(hasBalance).map((account) => ledgerDataStart(account, methods));
  if (starts.length === 0) return null;
  return { start: [...starts, ...(from ? [from] : [])].sort()[0], end: until };
}
