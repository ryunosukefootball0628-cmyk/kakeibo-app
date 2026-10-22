import {
  deleteField,
  deleteDoc,
  getCountFromServer,
  getDoc,
  getDocsFromCache,
  getDocsFromServer,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { isRecentlySignedIn } from '../auth/session';
import { auth, firestore } from '../firebase';
import type {
  BackupData,
  Category,
  PaymentMethod,
  RecurringExpense,
  Transaction,
} from '../types';
import {
  COLLECTION_NAMES,
  fromSnapshot,
  itemRef,
  profileRef,
  toDocData,
  userCollection,
  type CollectionName,
  type CollectionTypes,
} from './collections';
import { newId, SEED_CATEGORIES, SEED_PAYMENT_METHODS } from './seed';
import { assertOnline, reportSyncError } from './syncStatus';

type TransactionInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

/** 4 つのコレクションの中身一式 */
type DataSet = Omit<BackupData, 'version' | 'exportedAt'>;

/**
 * 画面操作からの書き込みはサーバーの応答を待たない。Firestore は端末のキャッシュに
 * 即座に反映して画面を更新し、オフラインなら接続が戻ってから送信する。応答を待つと
 * 電波の無い場所で画面が止まってしまうため、失敗だけをあとから画面上部に表示する。
 */
function inBackground(write: Promise<unknown>): void {
  write.catch(reportSyncError);
}

// ---------- 取引 ----------

export function addTransaction(input: TransactionInput): string {
  const now = new Date().toISOString();
  const id = newId();
  inBackground(
    setDoc(
      itemRef('transactions', id),
      toDocData('transactions', { ...input, id, createdAt: now, updatedAt: now }),
    ),
  );
  return id;
}

export function updateTransaction(id: string, input: TransactionInput): void {
  // 空にした任意項目 (memo など) は、残らないよう明示的に消す
  const changes = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      value === undefined ? deleteField() : value,
    ]),
  );
  inBackground(
    updateDoc(itemRef('transactions', id), {
      ...changes,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function deleteTransaction(id: string): void {
  inBackground(deleteDoc(itemRef('transactions', id)));
}

/** 定期支出の発生予定を実績の取引として記録する */
export function recordRecurring(recurring: RecurringExpense, date: string): void {
  addTransaction({
    type: 'expense',
    date,
    amount: recurring.amount,
    categoryId: recurring.categoryId,
    paymentMethodId: recurring.paymentMethodId,
    memo: recurring.memo || recurring.name,
    recurringSourceId: recurring.id,
  });
}

// ---------- マスタ・定期支出 ----------

export function saveCategory(category: Category): void {
  inBackground(
    setDoc(itemRef('categories', category.id), toDocData('categories', category)),
  );
}

export function deleteCategory(id: string): void {
  inBackground(deleteDoc(itemRef('categories', id)));
}

/**
 * 並べ替えたあとのカテゴリ (同じ種別のもの) に、先頭から 1, 2, 3… の表示順を振り直し、1 回の一括書き込みで送る。
 * 隣どうしの値を入れ替えるだけだと、同じ値が並んでいたときに順番が変わらないため、まとめて振り直す。
 * 他の端末での並べ替えがまだ届いていないなど、手元の sortOrder が古いこともあるため、値が同じに見える
 * ものも省かずに書く (省くと両方の並びが混ざる)。
 */
export function reorderCategories(ordered: Category[]): void {
  const batch = writeBatch(firestore);
  ordered.forEach((category, index) => {
    batch.update(itemRef('categories', category.id), { sortOrder: index + 1 });
  });
  inBackground(batch.commit());
}

export function savePaymentMethod(method: PaymentMethod): void {
  inBackground(
    setDoc(itemRef('paymentMethods', method.id), toDocData('paymentMethods', method)),
  );
}

export function deletePaymentMethod(id: string): void {
  inBackground(deleteDoc(itemRef('paymentMethods', id)));
}

export function saveRecurring(recurring: RecurringExpense): void {
  inBackground(
    setDoc(
      itemRef('recurringExpenses', recurring.id),
      toDocData('recurringExpenses', recurring),
    ),
  );
}

export function setRecurringActive(id: string, isActive: boolean): void {
  inBackground(updateDoc(itemRef('recurringExpenses', id), { isActive }));
}

export function deleteRecurring(id: string): void {
  inBackground(deleteDoc(itemRef('recurringExpenses', id)));
}

/** カテゴリ・支払い方法を削除する前に、それを使っている取引の件数を数える */
export async function countTransactionsUsing(
  field: 'categoryId' | 'paymentMethodId',
  id: string,
): Promise<number> {
  const q = query(userCollection('transactions'), where(field, '==', id));
  if (navigator.onLine) {
    try {
      return (await getCountFromServer(q)).data().count;
    } catch {
      // 下のキャッシュでの集計にまわす
    }
  }
  // オフラインでは端末に残っている分だけで数える (実際より少ないことがある)
  return (await getDocsFromCache(q)).size;
}

// ---------- 初回ログイン ----------

/**
 * 初回ログイン時に、プロフィールと初期のカテゴリ・支払い方法を作る。
 * 2台の端末で同時に初回ログインしても二重に作らないよう、トランザクションで確かめてから書く。
 */
export async function initializeUserData(uid: string): Promise<void> {
  const profile = profileRef(uid);
  // 2回目以降はここで終わる (オフライン時は端末のキャッシュで確かめる)
  const existing = await getDoc(profile).catch(() => null);
  if (existing?.exists()) return;

  await runTransaction(firestore, async (tx) => {
    if ((await tx.get(profile)).exists()) return;
    tx.set(profile, { createdAt: new Date().toISOString() });
    for (const category of SEED_CATEGORIES) {
      tx.set(itemRef('categories', category.id, uid), toDocData('categories', category));
    }
    for (const method of SEED_PAYMENT_METHODS) {
      tx.set(itemRef('paymentMethods', method.id, uid), toDocData('paymentMethods', method));
    }
  });
}

// ---------- まとめて読み書きする操作 ----------

type BatchOp = (batch: WriteBatch) => void;

/** Firestore の一括書き込みは 1 回 500 件までなので分けて送る */
const BATCH_LIMIT = 500;

async function commitAll(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

/** 端末のキャッシュには一部しか無いことがあるため、必ずサーバーから全件を読む */
async function fetchAll<K extends CollectionName>(
  name: K,
): Promise<CollectionTypes[K][]> {
  const snapshot = await getDocsFromServer(userCollection(name));
  return snapshot.docs.map((d) => fromSnapshot<CollectionTypes[K]>(d));
}

async function fetchEverything(): Promise<DataSet> {
  const [transactions, categories, paymentMethods, recurringExpenses] =
    await Promise.all([
      fetchAll('transactions'),
      fetchAll('categories'),
      fetchAll('paymentMethods'),
      fetchAll('recurringExpenses'),
    ]);
  return { transactions, categories, paymentMethods, recurringExpenses };
}

function upsertOps(data: DataSet): BatchOp[] {
  return COLLECTION_NAMES.flatMap((name) =>
    data[name].map((record): BatchOp => (batch) => {
      batch.set(itemRef(name, record.id), toDocData(name, record as never));
    }),
  );
}

/**
 * クラウドの内容を data と同じにする。先に data を書き込み、そのあと data に無い記録を消す。
 * 一括書き込みは 500 件ごとに分かれるため途中で失敗しうるが、この順なら記録が消えたまま
 * 終わることはなく、古い記録が残るだけで済む。
 */
async function replaceAll(data: DataSet): Promise<void> {
  const current = await fetchEverything();
  const deletes = COLLECTION_NAMES.flatMap((name) => {
    const keep = new Set(data[name].map((record) => record.id));
    return current[name]
      .filter((record) => !keep.has(record.id))
      .map((record): BatchOp => (batch) => batch.delete(itemRef(name, record.id)));
  });
  await commitAll([...upsertOps(data), ...deletes]);
}

export async function exportBackup(): Promise<BackupData> {
  assertOnline();
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    ...(await fetchEverything()),
  };
}

function assertBackup(data: unknown): asserts data is BackupData {
  const d = data as Partial<BackupData> | null;
  const isRecords = (v: unknown) =>
    Array.isArray(v) &&
    v.every(
      (record) =>
        typeof record?.id === 'string' &&
        record.id !== '' &&
        !record.id.includes('/'),
    );
  if (
    !d ||
    (d.version !== 1 && d.version !== 2) ||
    !isRecords(d.transactions) ||
    !isRecords(d.categories) ||
    !isRecords(d.paymentMethods) ||
    !isRecords(d.recurringExpenses)
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
  assertOnline();
  const data: unknown = JSON.parse(json);
  assertBackup(data);
  await replaceAll({ ...data, paymentMethods: migratePaymentMethods(data) });
}

/** 全データを削除し、カテゴリと支払い方法を初期状態に戻す */
export async function resetAll(): Promise<void> {
  assertOnline();
  await replaceAll({
    transactions: [],
    categories: SEED_CATEGORIES,
    paymentMethods: SEED_PAYMENT_METHODS,
    recurringExpenses: [],
  });
}

/**
 * クラウド上の全データとアカウントを削除する。直前に本人確認 (reauthenticate) を済ませておくこと。
 */
export async function deleteAccount(): Promise<void> {
  assertOnline();
  const user = auth.currentUser;
  if (!user) throw new Error('ログインしていません。');

  // アカウントの削除は直近のログインが必要。データだけ消えてアカウントが残らないよう、先に確かめる
  if (!(await isRecentlySignedIn(user))) {
    throw new Error('本人確認から時間が経ちました。もう一度「本人確認して削除」からやり直してください。');
  }

  const current = await fetchEverything();
  await commitAll([
    ...COLLECTION_NAMES.flatMap((name) =>
      current[name].map((record): BatchOp => (batch) => batch.delete(itemRef(name, record.id))),
    ),
    (batch) => batch.delete(profileRef()),
  ]);
  await deleteUser(user);
}
