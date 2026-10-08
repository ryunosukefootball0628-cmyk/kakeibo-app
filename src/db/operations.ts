import type {
  BackupData,
  PaymentMethod,
  RecurringExpense,
  Transaction,
} from '../types';
import { db, newId, SEED_CATEGORIES, SEED_PAYMENT_METHODS } from './db';

type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export async function addTransaction(input: TransactionInput): Promise<string> {
  const now = new Date().toISOString();
  const id = newId();
  await db.transactions.add({ ...input, id, createdAt: now, updatedAt: now });
  return id;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<void> {
  await db.transactions.update(id, {
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}

/** 定期支出の発生予定を実績の取引として記録する */
export async function recordRecurring(
  recurring: RecurringExpense,
  date: string,
): Promise<void> {
  await addTransaction({
    type: 'expense',
    date,
    amount: recurring.amount,
    categoryId: recurring.categoryId,
    paymentMethodId: recurring.paymentMethodId,
    memo: recurring.memo || recurring.name,
    recurringSourceId: recurring.id,
  });
}

export async function exportBackup(): Promise<BackupData> {
  const [transactions, categories, paymentMethods, recurringExpenses] =
    await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.paymentMethods.toArray(),
      db.recurringExpenses.toArray(),
    ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    transactions,
    categories,
    paymentMethods,
    recurringExpenses,
  };
}

function assertBackup(data: unknown): asserts data is BackupData {
  const d = data as Partial<BackupData> | null;
  const isArray = (v: unknown) => Array.isArray(v);
  if (
    !d ||
    (d.version !== 1 && d.version !== 2) ||
    !isArray(d.transactions) ||
    !isArray(d.categories) ||
    !isArray(d.paymentMethods) ||
    !isArray(d.recurringExpenses)
  ) {
    throw new Error('バックアップファイルの形式が正しくありません。');
  }
}

/** version 1 は paymentMonthOffset が「翌月 = 0」基準なので現行の基準に揃える */
function migratePaymentMethods(data: BackupData): PaymentMethod[] {
  if (data.version === 2) return data.paymentMethods;
  return data.paymentMethods.map((method) =>
    method.kind === 'credit_card' && method.paymentMonthOffset != null
      ? { ...method, paymentMonthOffset: method.paymentMonthOffset + 1 }
      : method,
  );
}

/** 既存データをすべて置き換える形で取り込む */
export async function importBackup(json: string): Promise<void> {
  const data: unknown = JSON.parse(json);
  assertBackup(data);
  const paymentMethods = migratePaymentMethods(data);

  await db.transaction(
    'rw',
    db.transactions,
    db.categories,
    db.paymentMethods,
    db.recurringExpenses,
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.paymentMethods.clear(),
        db.recurringExpenses.clear(),
      ]);
      await Promise.all([
        db.transactions.bulkAdd(data.transactions),
        db.categories.bulkAdd(data.categories),
        db.paymentMethods.bulkAdd(paymentMethods),
        db.recurringExpenses.bulkAdd(data.recurringExpenses),
      ]);
    },
  );
}

/** 全データを削除し、カテゴリと支払い方法を初期状態に戻す */
export async function resetAll(): Promise<void> {
  await db.transaction(
    'rw',
    db.transactions,
    db.categories,
    db.paymentMethods,
    db.recurringExpenses,
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.paymentMethods.clear(),
        db.recurringExpenses.clear(),
      ]);
      await db.categories.bulkAdd(SEED_CATEGORIES);
      await db.paymentMethods.bulkAdd(SEED_PAYMENT_METHODS);
    },
  );
}
