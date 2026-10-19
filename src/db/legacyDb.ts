import Dexie, { type Table } from 'dexie';
import type {
  BackupData,
  Category,
  PaymentMethod,
  RecurringExpense,
  Transaction,
} from '../types';
import { SEED_CATEGORIES, SEED_PAYMENT_METHODS } from './seed';

/**
 * クラウド同期に移行する前の、端末内 (IndexedDB) の保存先。
 * 新しいデータは書き込まず、残っている記録をクラウドへ取り込むためだけに読む。
 */
const LEGACY_DB_NAME = 'kakeibo';

class LegacyKakeiboDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  recurringExpenses!: Table<RecurringExpense, string>;

  constructor() {
    super(LEGACY_DB_NAME);

    this.version(1).stores({
      transactions: 'id, date, type, categoryId, paymentMethodId, recurringSourceId',
      categories: 'id, type, sortOrder',
      paymentMethods: 'id, kind, sortOrder',
      recurringExpenses: 'id, categoryId, paymentMethodId',
    });

    // version 1 のまま残っている端末もあるため、paymentMonthOffset を
    // 「翌月 = 0」基準から「当月 = 0」基準へ揃える変換は残しておく
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<PaymentMethod>('paymentMethods')
          .toCollection()
          .modify((method) => {
            if (method.kind === 'credit_card' && method.paymentMonthOffset != null) {
              method.paymentMonthOffset += 1;
            }
          });
      });
  }
}

/** 初期データから一切変更されていないか (それなら取り込む意味がない) */
function isUntouchedSeed<T extends { id: string }>(items: T[], seeds: T[]): boolean {
  return (
    items.length === seeds.length &&
    items.every((item) => {
      const seed = seeds.find((s) => s.id === item.id);
      if (!seed) return false;
      const keys = new Set([...Object.keys(item), ...Object.keys(seed)]);
      return [...keys].every(
        (key) => item[key as keyof T] === seed[key as keyof T],
      );
    })
  );
}

/**
 * 端末内に取り込む価値のある旧データがあれば返す。
 * 存在しない DB を開くと空の DB が作られてしまうため、先に有無を確かめる。
 */
export async function readLegacyData(): Promise<BackupData | null> {
  if (!(await Dexie.exists(LEGACY_DB_NAME))) return null;

  const legacy = new LegacyKakeiboDB();
  try {
    const [transactions, categories, paymentMethods, recurringExpenses] =
      await Promise.all([
        legacy.transactions.toArray(),
        legacy.categories.toArray(),
        legacy.paymentMethods.toArray(),
        legacy.recurringExpenses.toArray(),
      ]);

    const hasUserData =
      transactions.length > 0 ||
      recurringExpenses.length > 0 ||
      !isUntouchedSeed(categories, SEED_CATEGORIES) ||
      !isUntouchedSeed(paymentMethods, SEED_PAYMENT_METHODS);
    if (!hasUserData) return null;

    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      transactions,
      categories,
      paymentMethods,
      recurringExpenses,
    };
  } finally {
    legacy.close();
  }
}

export async function deleteLegacyData(): Promise<void> {
  await Dexie.delete(LEGACY_DB_NAME);
}
