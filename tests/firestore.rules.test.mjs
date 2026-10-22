// firestore.rules のテスト。エミュレーター上で動かす: npm run test:rules
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';

// 拒否されるはずの書き込みのたびに出る PERMISSION_DENIED の警告を抑える
setLogLevel('silent');

const env = await initializeTestEnvironment({
  projectId: 'demo-kakeibo',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
});

// 本番と同じく Google でログインしたアカウントとして振る舞う (既定のテスト用トークンは 'custom')
const signedIn = (uid, provider = 'google.com') =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: provider, identities: {} } })
    .firestore();
const alice = () => signedIn('alice');
const bob = () => signedIn('bob');
const guest = () => env.unauthenticatedContext().firestore();

const transaction = {
  type: 'expense',
  date: '2026-10-16',
  amount: 1200,
  categoryId: 'cat-food',
  paymentMethodId: 'pm-cash',
  memo: 'ランチ',
  createdAt: '2026-10-16T03:00:00.000Z',
  updatedAt: '2026-10-16T03:00:00.000Z',
};

const txRef = (db, uid = 'alice', id = 't1') => doc(db, 'users', uid, 'transactions', id);

before(() => env.clearFirestore());
beforeEach(() => env.clearFirestore());
after(() => env.cleanup());

describe('本人だけが読み書きできる', () => {
  test('本人は取引を作成・読み取り・削除できる', async () => {
    await assertSucceeds(setDoc(txRef(alice()), transaction));
    await assertSucceeds(getDoc(txRef(alice())));
    await assertSucceeds(
      getDocs(query(collection(alice(), 'users', 'alice', 'transactions'), where('date', '>=', '2026-10-01'))),
    );
    await assertSucceeds(deleteDoc(txRef(alice())));
  });

  test('他人の取引は読めず、書き込めず、消せない', async () => {
    await setDoc(txRef(alice()), transaction);
    await assertFails(getDoc(txRef(bob(), 'alice')));
    await assertFails(getDocs(collection(bob(), 'users', 'alice', 'transactions')));
    await assertFails(setDoc(txRef(bob(), 'alice', 't2'), transaction));
    await assertFails(deleteDoc(txRef(bob(), 'alice')));
  });

  test('ログインしていなければ何もできない', async () => {
    await assertFails(getDoc(txRef(guest())));
    await assertFails(setDoc(txRef(guest()), transaction));
  });

  test('Google 以外の方法でログインしたアカウントは自分の場所でも使えない', async () => {
    for (const provider of ['anonymous', 'password', 'custom']) {
      const db = signedIn('alice', provider);
      await assertFails(getDoc(txRef(db)));
      await assertFails(setDoc(txRef(db), transaction));
      await assertFails(setDoc(doc(db, 'users', 'alice'), { createdAt: '2026-10-16T03:00:00.000Z' }));
    }
  });

  test('プロフィールは本人だけが読み取り・削除できる', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users', 'alice'), { createdAt: '2026-10-16T03:00:00.000Z' }));
    await assertFails(getDoc(doc(bob(), 'users', 'alice')));
    await assertFails(deleteDoc(doc(bob(), 'users', 'alice')));
    await assertSucceeds(deleteDoc(doc(alice(), 'users', 'alice')));
  });

  test('決められた場所以外には書き込めない', async () => {
    await assertFails(setDoc(doc(alice(), 'other', 'x'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'users', 'alice', 'unknown', 'x'), { a: 1 }));
  });
});

describe('取引の形式', () => {
  test('メモなし・定期支出からの記録は保存できる', async () => {
    const { memo: _memo, ...withoutMemo } = transaction;
    await assertSucceeds(setDoc(txRef(alice(), 'alice', 'a'), withoutMemo));
    await assertSucceeds(
      setDoc(txRef(alice(), 'alice', 'b'), { ...transaction, recurringSourceId: 'r1' }),
    );
  });

  test('メモを消す更新ができる', async () => {
    await setDoc(txRef(alice()), transaction);
    await assertSucceeds(
      updateDoc(txRef(alice()), { memo: deleteField(), amount: 1500, updatedAt: '2026-10-17T00:00:00.000Z' }),
    );
  });

  for (const [label, data] of [
    ['想定外の項目', { ...transaction, extra: true }],
    ['必須項目の欠落', { ...transaction, amount: undefined }],
    ['負の金額', { ...transaction, amount: -1 }],
    ['小数の金額', { ...transaction, amount: 10.5 }],
    ['文字列の金額', { ...transaction, amount: '1000' }],
    ['不正な日付', { ...transaction, date: '2026/10/16' }],
    ['不正な種別', { ...transaction, type: 'transfer' }],
    ['長すぎるメモ', { ...transaction, memo: 'あ'.repeat(1001) }],
  ]) {
    test(`${label}は拒否される`, async () => {
      const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await assertFails(setDoc(txRef(alice()), cleaned));
    });
  }

  test('長すぎる ID は拒否される', async () => {
    await assertFails(setDoc(txRef(alice(), 'alice', 'x'.repeat(65)), transaction));
  });

  test('給料として記録した取引 (勤務先・支給月・総支給額付き)', async () => {
    const salary = {
      ...transaction,
      type: 'income',
      categoryId: 'cat-salary',
      paymentMethodId: 'pm-bank',
      amount: 85000,
      workplaceId: 'w1',
      payMonth: '2026-11',
      grossPay: 88000,
    };
    await assertSucceeds(setDoc(txRef(alice()), salary));
    await assertSucceeds(
      getDocs(query(collection(alice(), 'users', 'alice', 'transactions'), where('payMonth', '>=', '2026-01'))),
    );
    await assertFails(setDoc(txRef(alice()), { ...salary, payMonth: '2026-11-25' }));
    await assertFails(setDoc(txRef(alice()), { ...salary, payMonth: '2026-13' }));
    await assertFails(setDoc(txRef(alice()), { ...salary, grossPay: -1 }));
    await assertFails(setDoc(txRef(alice()), { ...salary, grossPay: 100.5 }));
    await assertFails(setDoc(txRef(alice()), { ...salary, workplaceId: 'x'.repeat(65) }));
  });
});

describe('シフト・給与の形式', () => {
  const ref = (name, id) => doc(alice(), 'users', 'alice', name, id);

  const workplace = {
    name: 'カフェ',
    color: '#1d7cd6',
    closingDay: 31,
    paymentDay: 25,
    paymentMonthOffset: 1,
    nightPremiumPercent: 25,
    overtimePremiumPercent: 25,
    isActive: true,
    sortOrder: 1,
  };

  const payRate = {
    workplaceId: 'w1',
    startDate: '2026-10-01',
    hourlyWage: 1200,
    transportFee: 300,
  };

  const shift = {
    workplaceId: 'w1',
    date: '2026-10-22',
    startTime: '18:00',
    endTime: '02:00',
    breakMinutes: 60,
  };

  test('勤務先', async () => {
    await assertSucceeds(setDoc(ref('workplaces', 'w1'), workplace));
    await assertSucceeds(updateDoc(ref('workplaces', 'w1'), { isActive: false }));
    await assertFails(setDoc(ref('workplaces', 'w1'), { ...workplace, paymentMonthOffset: 3 }));
    await assertFails(setDoc(ref('workplaces', 'w1'), { ...workplace, nightPremiumPercent: 101 }));
    await assertFails(setDoc(ref('workplaces', 'w1'), { ...workplace, closingDay: 0 }));
    await assertFails(setDoc(ref('workplaces', 'w1'), { ...workplace, sortOrder: Infinity }));
    const { isActive: _isActive, ...withoutActive } = workplace;
    await assertFails(setDoc(ref('workplaces', 'w1'), withoutActive));
  });

  test('時給・交通費', async () => {
    await assertSucceeds(setDoc(ref('payRates', 'r1'), payRate));
    await assertSucceeds(
      setDoc(ref('payRates', 'r1'), { ...payRate, saturdayWage: 1300, sundayWage: 1300, holidayWage: 1400 }),
    );
    await assertFails(setDoc(ref('payRates', 'r1'), { ...payRate, hourlyWage: 1200.5 }));
    await assertFails(setDoc(ref('payRates', 'r1'), { ...payRate, holidayWage: '1400' }));
    await assertFails(setDoc(ref('payRates', 'r1'), { ...payRate, startDate: '2026/10/01' }));
    await assertFails(setDoc(ref('payRates', 'r1'), { ...payRate, nightWage: 1500 }));
  });

  test('シフト (日をまたぐもの・メモ付き)', async () => {
    await assertSucceeds(setDoc(ref('shifts', 's1'), shift));
    await assertSucceeds(setDoc(ref('shifts', 's1'), { ...shift, memo: 'ヘルプ' }));
    await assertSucceeds(
      getDocs(query(collection(alice(), 'users', 'alice', 'shifts'), where('workplaceId', '==', 'w1'))),
    );
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, date: '2026-13-01' }));
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, startTime: '24:00' }));
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, endTime: '9:00' }));
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, breakMinutes: -10 }));
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, breakMinutes: 1440 }));
    await assertFails(setDoc(ref('shifts', 's1'), { ...shift, memo: 'あ'.repeat(1001) }));
  });

  test('シフトのテンプレート', async () => {
    const template = { workplaceId: 'w1', name: '早番', startTime: '09:00', endTime: '17:00', breakMinutes: 60 };
    await assertSucceeds(setDoc(ref('shiftTemplates', 't1'), template));
    await assertFails(setDoc(ref('shiftTemplates', 't1'), { ...template, name: '' }));
    await assertFails(setDoc(ref('shiftTemplates', 't1'), { ...template, name: 'あ'.repeat(51) }));
  });

  test('他人のシフトは読めず、書き込めない', async () => {
    await setDoc(ref('shifts', 's1'), shift);
    await assertFails(getDoc(doc(bob(), 'users', 'alice', 'shifts', 's1')));
    await assertFails(setDoc(doc(bob(), 'users', 'alice', 'workplaces', 'w2'), workplace));
    await assertFails(deleteDoc(doc(bob(), 'users', 'alice', 'shifts', 's1')));
  });
});

describe('マスタ・定期支出・プロフィールの形式', () => {
  test('カテゴリ', async () => {
    const ref = doc(alice(), 'users', 'alice', 'categories', 'cat-food');
    const category = { name: '食費', type: 'expense', color: '#e8743b', sortOrder: 1 };
    await assertSucceeds(setDoc(ref, category));
    await assertFails(setDoc(ref, { ...category, name: '' }));
    await assertFails(setDoc(ref, { ...category, type: 'other' }));
  });

  test('支払い方法 (現金とクレジットカード)', async () => {
    const col = (id) => doc(alice(), 'users', 'alice', 'paymentMethods', id);
    await assertSucceeds(setDoc(col('pm-cash'), { name: '現金', kind: 'cash', sortOrder: 1 }));
    const card = {
      name: 'カードA',
      kind: 'credit_card',
      closingDay: 15,
      paymentDay: 27,
      paymentMonthOffset: 1,
      sortOrder: 3,
    };
    await assertSucceeds(setDoc(col('card'), card));
    await assertFails(setDoc(col('card'), { ...card, closingDay: 32 }));
    await assertFails(setDoc(col('card'), { ...card, kind: 'crypto' }));
  });

  test('定期支出 (毎月・毎年)', async () => {
    const ref = doc(alice(), 'users', 'alice', 'recurringExpenses', 'r1');
    const monthly = {
      name: 'Netflix',
      amount: 1490,
      categoryId: 'cat-fun',
      paymentMethodId: 'pm-bank',
      cycle: 'monthly',
      dayOfMonth: 31,
      isActive: true,
    };
    await assertSucceeds(setDoc(ref, monthly));
    await assertSucceeds(setDoc(ref, { ...monthly, cycle: 'yearly', monthOfYear: 4, memo: '年払い' }));
    await assertSucceeds(updateDoc(ref, { isActive: false }));
    await assertFails(setDoc(ref, { ...monthly, isActive: 'yes' }));
    await assertFails(setDoc(ref, { ...monthly, monthOfYear: 13 }));
  });

  test('プロフィールは createdAt だけ', async () => {
    const ref = doc(alice(), 'users', 'alice');
    await assertSucceeds(setDoc(ref, { createdAt: '2026-10-16T03:00:00.000Z' }));
    await assertFails(setDoc(ref, { createdAt: '2026-10-16T03:00:00.000Z', admin: true }));
  });
});

describe('入力欄の上限・ありえない値', () => {
  // 入力欄の maxLength は文字数で数えるので、日本語でも上限ちょうどなら保存できることを確かめる
  test('上限ちょうどの日本語のメモ・名称と金額は保存できる', async () => {
    await assertSucceeds(
      setDoc(txRef(alice()), { ...transaction, memo: 'あ'.repeat(1000), amount: 1000000000000 }),
    );
    await assertSucceeds(
      setDoc(doc(alice(), 'users', 'alice', 'categories', 'c1'), {
        name: 'あ'.repeat(100),
        type: 'expense',
        color: '#e8743b',
        sortOrder: 1,
      }),
    );
  });

  for (const [label, data] of [
    ['13 月の日付', { ...transaction, date: '2026-13-01' }],
    ['32 日の日付', { ...transaction, date: '2026-10-32' }],
    ['0 日の日付', { ...transaction, date: '2026-10-00' }],
    ['1 兆円を超える金額', { ...transaction, amount: 1000000000001 }],
  ]) {
    test(`${label}は拒否される`, async () => {
      await assertFails(setDoc(txRef(alice()), data));
    });
  }

  test('表示順は NaN・Infinity・極端な値を拒否する', async () => {
    const ref = doc(alice(), 'users', 'alice', 'categories', 'c1');
    const category = { name: '食費', type: 'expense', color: '#e8743b', sortOrder: 1 };
    await assertSucceeds(setDoc(ref, { ...category, sortOrder: 1.5 }));
    for (const sortOrder of [NaN, Infinity, -Infinity, 1000001]) {
      await assertFails(setDoc(ref, { ...category, sortOrder }));
    }
  });
});
