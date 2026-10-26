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
  PayRate,
  RecurringExpense,
  Shift,
  ShiftTemplate,
  Transaction,
  Workplace,
} from '../types';
import { monthRange } from '../utils/date';
import { compareShifts } from '../utils/shift';

/** 結果が届くまでに返す空配列。毎回同じものを返し、余計な再計算を起こさない */
const NONE: never[] = [];

export interface LiveResult<T> {
  items: T[];
  /** いまの条件での最初の結果がまだ届いていない (届くまでは前の条件の結果を返す) */
  loading: boolean;
}

/**
 * クエリの結果を購読し、変更 (他の端末からの更新を含む) のたびに再描画する。
 * makeQuery が null のあいだは購読しない。
 */
function useLiveResult<T>(
  makeQuery: ((uid: string) => Query) | null,
  deps: DependencyList,
  transform: (items: T[]) => T[] = (items) => items,
): LiveResult<T> {
  const { uid } = useUser();
  // deps は文字列などの値なので、まとめて文字列にして条件が変わったかを見分ける
  const key = JSON.stringify([uid, makeQuery !== null, ...deps]);
  const [result, setResult] = useState<{ key: string; items: T[] }>();

  useEffect(() => {
    if (!makeQuery) return;
    return onSnapshot(
      makeQuery(uid),
      (snapshot) =>
        setResult({ key, items: transform(snapshot.docs.map((d) => fromSnapshot<T>(d))) }),
      reportSyncError,
    );
    // makeQuery と transform は deps から決まるため依存に含めない
  }, [key]);

  if (!makeQuery) return { items: NONE, loading: false };
  return { items: result?.items ?? NONE, loading: result?.key !== key };
}

/** 最初の結果が届くまでは空配列を返す。makeQuery が null なら読まない */
function useLiveQuery<T>(
  makeQuery: ((uid: string) => Query) | null,
  deps: DependencyList,
  transform?: (items: T[]) => T[],
): T[] {
  return useLiveResult(makeQuery, deps, transform).items;
}

export function useCategories() {
  return useLiveQuery<Category>(
    (uid) => query(userCollection('categories', uid), orderBy('sortOrder')),
    [],
  );
}

export function usePaymentMethods() {
  return usePaymentMethodsResult().items;
}

/** 読み込み中かも返す。残高のように、読み込む前の空の結果で計算すると誤った値が出るもの向け */
export function usePaymentMethodsResult() {
  return useLiveResult<PaymentMethod>(
    (uid) => query(userCollection('paymentMethods', uid), orderBy('sortOrder')),
    [],
  );
}

/** enabled が false (定期支出を使わない設定) なら読まない */
export function useRecurrings(enabled = true) {
  return useLiveQuery<RecurringExpense>(
    enabled ? (uid) => userCollection('recurringExpenses', uid) : null,
    [],
    (items) => items.sort((a, b) => a.name.localeCompare(b.name, 'ja')),
  );
}

/** 日付の新しい順に取得する (start, end は両端を含む) */
export function useTransactionsBetween(start: string, end: string) {
  return useTransactionsResult({ start, end }).items;
}

/** 読み込み中かも返す。range が null なら読まない */
export function useTransactionsResult(range: { start: string; end: string } | null) {
  return useLiveResult<Transaction>(
    range &&
      ((uid) =>
        query(
          userCollection('transactions', uid),
          where('date', '>=', range.start),
          where('date', '<=', range.end),
        )),
    [range?.start, range?.end],
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

export function useLookup<T extends Category | PaymentMethod | Workplace>(items: T[]) {
  return useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
}

// ---------- シフト・給与 ----------
// enabled を受け取るものは、false (シフト・給与を使わない設定) なら読まない

export function useWorkplaces(enabled = true) {
  return useLiveQuery<Workplace>(
    enabled ? (uid) => query(userCollection('workplaces', uid), orderBy('sortOrder')) : null,
    [],
  );
}

/** 時給の設定は勤務先ごとに数件なので、すべて読む */
export function usePayRates(enabled = true) {
  return useLiveQuery<PayRate>(
    enabled ? (uid) => userCollection('payRates', uid) : null,
    [],
  );
}

export function useShiftTemplates() {
  return useLiveQuery<ShiftTemplate>(
    (uid) => userCollection('shiftTemplates', uid),
    [],
    (items) => items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
  );
}

/** 日付・開始時刻の順に取得する (start, end は両端を含む) */
export function useShiftsBetween(start: string, end: string, enabled = true) {
  return useLiveQuery<Shift>(
    enabled
      ? (uid) =>
          query(
            userCollection('shifts', uid),
            where('date', '>=', start),
            where('date', '<=', end),
          )
      : null,
    [start, end],
    (items) => items.sort(compareShifts),
  );
}

/**
 * 給料として記録した取引 (支給月が from〜to のもの)。
 * payMonth を持たない普通の取引はこの条件に当てはまらないので含まれない。
 */
export function useSalaryTransactions(fromMonth: string, toMonth: string, enabled = true) {
  return useLiveQuery<Transaction>(
    enabled
      ? (uid) =>
          query(
            userCollection('transactions', uid),
            where('payMonth', '>=', fromMonth),
            where('payMonth', '<=', toMonth),
          )
      : null,
    [fromMonth, toMonth],
    (items) => items.sort((a, b) => b.date.localeCompare(a.date)),
  );
}
