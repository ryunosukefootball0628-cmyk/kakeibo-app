import {
  collection,
  doc,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { auth, firestore } from '../firebase';
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

/**
 * Firestore 上の配置:
 *   users/{uid}                       … プロフィール (初期データを作成済みかの目印)
 *   users/{uid}/transactions/{id}     … 取引
 *   users/{uid}/categories/{id}       … カテゴリ
 *   users/{uid}/paymentMethods/{id}   … 支払い方法
 *   users/{uid}/recurringExpenses/{id}… 定期支出
 *   users/{uid}/workplaces/{id}       … 勤務先
 *   users/{uid}/payRates/{id}         … 勤務先の時給・交通費 (適用開始日ごと)
 *   users/{uid}/shifts/{id}           … シフト
 *   users/{uid}/shiftTemplates/{id}   … シフトのテンプレート
 * 本人以外が読み書きできないことは firestore.rules で保証する。
 */
export interface CollectionTypes {
  transactions: Transaction;
  categories: Category;
  paymentMethods: PaymentMethod;
  recurringExpenses: RecurringExpense;
  workplaces: Workplace;
  payRates: PayRate;
  shifts: Shift;
  shiftTemplates: ShiftTemplate;
}

export type CollectionName = keyof CollectionTypes;

export const COLLECTION_NAMES: CollectionName[] = [
  'transactions',
  'categories',
  'paymentMethods',
  'recurringExpenses',
  'workplaces',
  'payRates',
  'shifts',
  'shiftTemplates',
];

/**
 * ドキュメントに保存する項目 (id はドキュメント ID なので含めない)。
 * firestore.rules の hasOnly と揃えておくこと。
 */
const FIELDS: { [K in CollectionName]: Exclude<keyof CollectionTypes[K], 'id'>[] } = {
  transactions: [
    'type',
    'date',
    'amount',
    'categoryId',
    'paymentMethodId',
    'memo',
    'recurringSourceId',
    'workplaceId',
    'payMonth',
    'grossPay',
    'createdAt',
    'updatedAt',
  ],
  categories: ['name', 'type', 'color', 'sortOrder'],
  paymentMethods: [
    'name',
    'kind',
    'closingDay',
    'paymentDay',
    'paymentMonthOffset',
    'debitAccountId',
    'balanceDate',
    'balance',
    'sortOrder',
  ],
  recurringExpenses: [
    'name',
    'amount',
    'categoryId',
    'paymentMethodId',
    'cycle',
    'dayOfMonth',
    'monthOfYear',
    'isActive',
    'memo',
  ],
  workplaces: [
    'name',
    'color',
    'closingDay',
    'paymentDay',
    'paymentMonthOffset',
    'nightPremiumPercent',
    'overtimePremiumPercent',
    'isActive',
    'sortOrder',
  ],
  payRates: [
    'workplaceId',
    'startDate',
    'hourlyWage',
    'saturdayWage',
    'sundayWage',
    'holidayWage',
    'transportFee',
  ],
  shifts: ['workplaceId', 'date', 'startTime', 'endTime', 'breakMinutes', 'memo'],
  shiftTemplates: ['workplaceId', 'name', 'startTime', 'endTime', 'breakMinutes'],
};

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('ログインしていません。');
  return uid;
}

export const profileRef = (uid = currentUid()) => doc(firestore, 'users', uid);

export const userCollection = (name: CollectionName, uid = currentUid()) =>
  collection(firestore, 'users', uid, name);

export const itemRef = (name: CollectionName, id: string, uid = currentUid()) =>
  doc(userCollection(name, uid), id);

export function fromSnapshot<T>(snapshot: DocumentSnapshot): T {
  return { ...snapshot.data(), id: snapshot.id } as T;
}

/**
 * 保存する形に変換する。JSON から取り込んだ記録に余計な項目や null が混じっていても
 * ルールで拒否されないよう、決まった項目だけを残す。
 */
export function toDocData<K extends CollectionName>(
  name: K,
  record: CollectionTypes[K],
): DocumentData {
  const data: DocumentData = {};
  for (const key of FIELDS[name]) {
    const value = record[key];
    if (value !== undefined && value !== null) data[key as string] = value;
  }
  return data;
}
