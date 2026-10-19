import {
  onSnapshot,
  orderBy,
  query,
  where,
  type Query,
} from 'firebase/firestore';
import { useEffect, useMemo, useState, type DependencyList } from 'react';
import { useUser } from '../auth/session';
import { fromSnapshot, itemRef, userCollection } from '../db/collections';
import { reportSyncError } from '../db/syncStatus';
import type {
  Category,
  PaymentMethod,
  RecurringExpense,
  Transaction,
} from '../types';
import { monthRange } from '../utils/date';

/**
 * クエリの結果を購読し、変更 (他の端末からの更新を含む) のたびに再描画する。
 * 最初の結果が届くまでは空配列を返す。
 */
function useLiveQuery<T>(
  makeQuery: (uid: string) => Query,
  deps: DependencyList,
  transform: (items: T[]) => T[] = (items) => items,
): T[] {
  const { uid } = useUser();
  const [items, setItems] = useState<T[]>([]);

  useEffect(
    () =>
      onSnapshot(
        makeQuery(uid),
        (snapshot) => setItems(transform(snapshot.docs.map((d) => fromSnapshot<T>(d)))),
        reportSyncError,
      ),
    // makeQuery と transform は deps から決まるため依存に含めない
    [uid, ...deps],
  );

  return items;
}

export function useCategories() {
  return useLiveQuery<Category>(
    (uid) => query(userCollection('categories', uid), orderBy('sortOrder')),
    [],
  );
}

export function usePaymentMethods() {
  return useLiveQuery<PaymentMethod>(
    (uid) => query(userCollection('paymentMethods', uid), orderBy('sortOrder')),
    [],
  );
}

export function useRecurrings() {
  return useLiveQuery<RecurringExpense>(
    (uid) => userCollection('recurringExpenses', uid),
    [],
    (items) => items.sort((a, b) => a.name.localeCompare(b.name, 'ja')),
  );
}

/** 日付の新しい順に取得する (start, end は両端を含む) */
export function useTransactionsBetween(start: string, end: string) {
  return useLiveQuery<Transaction>(
    (uid) =>
      query(
        userCollection('transactions', uid),
        where('date', '>=', start),
        where('date', '<=', end),
      ),
    [start, end],
    (items) =>
      items.sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
  );
}

export function useTransactionsInMonth(yearMonth: string) {
  const { start, end } = monthRange(yearMonth);
  return useTransactionsBetween(start, end);
}

/** 1件の取引。読み込み中や存在しない場合は undefined */
export function useTransaction(id: string | undefined) {
  const { uid } = useUser();
  const [item, setItem] = useState<Transaction>();

  useEffect(() => {
    setItem(undefined);
    if (!id) return;
    return onSnapshot(
      itemRef('transactions', id, uid),
      (snapshot) =>
        setItem(snapshot.exists() ? fromSnapshot<Transaction>(snapshot) : undefined),
      reportSyncError,
    );
  }, [uid, id]);

  return item;
}

export function useLookup<T extends Category | PaymentMethod>(items: T[]) {
  return useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
}
