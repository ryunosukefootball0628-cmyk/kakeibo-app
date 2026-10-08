import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { Category, PaymentMethod } from '../types';
import { monthRange } from '../utils/date';

export function useCategories() {
  return useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    [],
  );
}

export function usePaymentMethods() {
  return useLiveQuery(
    () => db.paymentMethods.orderBy('sortOrder').toArray(),
    [],
    [],
  );
}

export function useRecurrings() {
  return useLiveQuery(
    async () => {
      const items = await db.recurringExpenses.toArray();
      return items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    },
    [],
    [],
  );
}

/** 日付の新しい順に取得する (start, end は両端を含む) */
export function useTransactionsBetween(start: string, end: string) {
  return useLiveQuery(
    async () => {
      const items = await db.transactions
        .where('date')
        .between(start, end, true, true)
        .toArray();
      return items.sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      );
    },
    [start, end],
    [],
  );
}

export function useTransactionsInMonth(yearMonth: string) {
  const { start, end } = monthRange(yearMonth);
  return useTransactionsBetween(start, end);
}

export function useLookup<T extends Category | PaymentMethod>(items: T[]) {
  return useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
}
