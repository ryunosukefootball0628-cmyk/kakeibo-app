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
  PayRate,
  RecurringExpense,
  Shift,
  ShiftTemplate,
  Transaction,
  Workplace,
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

/** 全コレクションの中身一式 */
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
 * 並べ替えたあとの記録に、先頭から 1, 2, 3… の表示順を振り直し、1 回の一括書き込みで送る。
 * 隣どうしの値を入れ替えるだけだと、同じ値が並んでいたときに順番が変わらないため、まとめて振り直す。
 * 他の端末での並べ替えがまだ届いていないなど、手元の sortOrder が古いこともあるため、値が同じに見える
 * ものも省かずに書く (省くと両方の並びが混ざる)。
 */
function reorder(name: 'categories' | 'paymentMethods', ordered: { id: string }[]): void {
  const batch = writeBatch(firestore);
  ordered.forEach((record, index) => {
    batch.update(itemRef(name, record.id), { sortOrder: index + 1 });
  });
  inBackground(batch.commit());
}

/** ordered は同じ種別 (収入／支出) のカテゴリだけを並べたもの */
export function reorderCategories(ordered: Category[]): void {
  reorder('categories', ordered);
}

export function savePaymentMethod(method: PaymentMethod): void {
  inBackground(
    setDoc(itemRef('paymentMethods', method.id), toDocData('paymentMethods', method)),
  );
}

/** 銀行口座を消すときは、そこを引き落とし口座にしているカードの設定も外す */
export function deletePaymentMethod(id: string, paymentMethods: PaymentMethod[]): void {
  const batch = writeBatch(firestore);
  for (const card of paymentMethods.filter((m) => m.debitAccountId === id)) {
    batch.update(itemRef('paymentMethods', card.id), { debitAccountId: deleteField() });
  }
  batch.delete(itemRef('paymentMethods', id));
  inBackground(batch.commit());
}

/** 銀行口座の残高を合わせる。balance は balanceDate の終わりの時点の残高 */
export function setAccountBalance(id: string, balanceDate: string, balance: number): void {
  inBackground(updateDoc(itemRef('paymentMethods', id), { balanceDate, balance }));
}

export function reorderPaymentMethods(ordered: PaymentMethod[]): void {
  reorder('paymentMethods', ordered);
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

/** 削除する前に、それを参照している記録の件数を数える */
async function countReferences(
  name: CollectionName,
  field: string,
  id: string,
): Promise<number> {
  const q = query(userCollection(name), where(field, '==', id));
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

/** カテゴリ・支払い方法を削除する前に、それを使っている取引の件数を数える */
export function countTransactionsUsing(
  field: 'categoryId' | 'paymentMethodId',
  id: string,
): Promise<number> {
  return countReferences('transactions', field, id);
}

// ---------- シフト・給与 ----------

/** 勤務先を新しく作る。最初の時給の設定も一緒に書き込む */
export function addWorkplace(workplace: Workplace, rate: PayRate): void {
  const batch = writeBatch(firestore);
  batch.set(itemRef('workplaces', workplace.id), toDocData('workplaces', workplace));
  batch.set(itemRef('payRates', rate.id), toDocData('payRates', rate));
  inBackground(batch.commit());
}

export function saveWorkplace(workplace: Workplace): void {
  inBackground(
    setDoc(itemRef('workplaces', workplace.id), toDocData('workplaces', workplace)),
  );
}

export function setWorkplaceActive(id: string, isActive: boolean): void {
  inBackground(updateDoc(itemRef('workplaces', id), { isActive }));
}

export function savePayRate(rate: PayRate): void {
  inBackground(setDoc(itemRef('payRates', rate.id), toDocData('payRates', rate)));
}

export function deletePayRate(id: string): void {
  inBackground(deleteDoc(itemRef('payRates', id)));
}

/** 時給の履歴をすべて消し、1 つの設定に置き換える (過去のシフトにも同じ額を使う) */
export function replacePayRates(current: PayRate[], rate: PayRate): void {
  const batch = writeBatch(firestore);
  for (const old of current) {
    if (old.id !== rate.id) batch.delete(itemRef('payRates', old.id));
  }
  batch.set(itemRef('payRates', rate.id), toDocData('payRates', rate));
  inBackground(batch.commit());
}

/** 勤務先を削除する前に、その勤務先のシフトの件数を数える */
export function countShiftsOf(workplaceId: string): Promise<number> {
  return countReferences('shifts', 'workplaceId', workplaceId);
}

/**
 * 勤務先と、そのシフト・テンプレート・時給の設定をまとめて削除する。
 * 記録済みの給料 (取引) は家計簿の記録なので残す。
 * 端末のキャッシュには一部しか無いことがあるため、サーバーから読んで消す。
 */
export async function deleteWorkplace(id: string): Promise<void> {
  assertOnline();
  const related = await Promise.all(
    (['shifts', 'shiftTemplates', 'payRates'] as const).map(async (name) => {
      const snapshot = await getDocsFromServer(
        query(userCollection(name), where('workplaceId', '==', id)),
      );
      return snapshot.docs.map((d): BatchOp => (batch) => batch.delete(d.ref));
    }),
  );
  // 勤務先は最後に消す。途中で失敗しても、シフトが残ったまま勤務先だけ消えることはない
  await commitAll([
    ...related.flat(),
    (batch) => batch.delete(itemRef('workplaces', id)),
  ]);
}

export function saveShift(shift: Shift): void {
  inBackground(setDoc(itemRef('shifts', shift.id), toDocData('shifts', shift)));
}

/** 複数の日にまとめて登録する */
export function addShifts(shifts: Shift[]): void {
  const batch = writeBatch(firestore);
  for (const shift of shifts) {
    batch.set(itemRef('shifts', shift.id), toDocData('shifts', shift));
  }
  inBackground(batch.commit());
}

export function deleteShift(id: string): void {
  inBackground(deleteDoc(itemRef('shifts', id)));
}

export function saveShiftTemplate(template: ShiftTemplate): void {
  inBackground(
    setDoc(itemRef('shiftTemplates', template.id), toDocData('shiftTemplates', template)),
  );
}

export function deleteShiftTemplate(id: string): void {
  inBackground(deleteDoc(itemRef('shiftTemplates', id)));
}

export interface SalaryInput {
  workplaceId: string;
  /** 支給月 (YYYY-MM) */
  payMonth: string;
  /** 入金日 */
  date: string;
  /** 口座に入った額 (手取り) */
  amount: number;
  /** 給与明細の総支給額 */
  grossPay?: number;
  categoryId: string;
  paymentMethodId: string;
  memo?: string;
}

/** 給料を収入の取引として記録する。勤務先と支給月を残し、見込みと突き合わせられるようにする */
export function recordSalary(input: SalaryInput): string {
  return addTransaction({ type: 'income', ...input });
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
  const entries = await Promise.all(
    COLLECTION_NAMES.map(async (name) => [name, await fetchAll(name)] as const),
  );
  return Object.fromEntries(entries) as unknown as DataSet;
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
    version: 3,
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
  // シフト・給与の記録は version 3 で加わった
  const hasShiftData =
    d?.version !== 3 ||
    (isRecords(d.workplaces) &&
      isRecords(d.payRates) &&
      isRecords(d.shifts) &&
      isRecords(d.shiftTemplates));
  if (
    !d ||
    (d.version !== 1 && d.version !== 2 && d.version !== 3) ||
    !isRecords(d.transactions) ||
    !isRecords(d.categories) ||
    !isRecords(d.paymentMethods) ||
    !isRecords(d.recurringExpenses) ||
    !hasShiftData
  ) {
    throw new Error('バックアップファイルの形式が正しくありません。');
  }
}

/** version 1 は paymentMonthOffset が「翌月 = 0」基準なので現行の基準に揃える */
function migratePaymentMethods(data: BackupData): PaymentMethod[] {
  if (data.version !== 1) return data.paymentMethods;
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
  await replaceAll({
    ...data,
    paymentMethods: migratePaymentMethods(data),
    // version 2 までのファイルにはシフト・給与の記録が無いので、取り込むと空になる
    workplaces: data.workplaces ?? [],
    payRates: data.payRates ?? [],
    shifts: data.shifts ?? [],
    shiftTemplates: data.shiftTemplates ?? [],
  });
}

/** 全データを削除し、カテゴリと支払い方法を初期状態に戻す */
export async function resetAll(): Promise<void> {
  assertOnline();
  await replaceAll({
    transactions: [],
    categories: SEED_CATEGORIES,
    paymentMethods: SEED_PAYMENT_METHODS,
    recurringExpenses: [],
    workplaces: [],
    payRates: [],
    shifts: [],
    shiftTemplates: [],
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
