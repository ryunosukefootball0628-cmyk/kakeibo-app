import type { RecurringExpense, Transaction } from '../types';
import { dateOfClampedDay, parseYearMonth } from './date';

/** 指定年月にその定期支出が発生するなら発生日を返す。発生しないなら null */
export function occurrenceDate(
  recurring: RecurringExpense,
  yearMonth: string,
): string | null {
  if (recurring.cycle === 'yearly') {
    const { month } = parseYearMonth(yearMonth);
    if (recurring.monthOfYear !== month) return null;
  }
  return dateOfClampedDay(yearMonth, recurring.dayOfMonth);
}

export interface PendingRecurring {
  recurring: RecurringExpense;
  date: string;
}

/**
 * 指定年月に発生するはずなのに、まだ取引として記録されていない定期支出を返す。
 * 重複登録を防ぐため自動生成はせず、ユーザーが確認して確定する運用にしている。
 */
export function pendingRecurrings(
  recurrings: RecurringExpense[],
  transactions: Transaction[],
  yearMonth: string,
): PendingRecurring[] {
  const recorded = new Set(
    transactions
      .filter((t) => t.recurringSourceId && t.date.startsWith(yearMonth))
      .map((t) => t.recurringSourceId),
  );

  return recurrings
    .filter((r) => r.isActive && !recorded.has(r.id))
    .flatMap((recurring) => {
      const date = occurrenceDate(recurring, yearMonth);
      return date ? [{ recurring, date }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
