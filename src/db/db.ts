import Dexie, { type Table } from 'dexie';
import type {
  Category,
  PaymentMethod,
  RecurringExpense,
  Transaction,
} from '../types';

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-food', name: '食費', type: 'expense', color: '#e8743b', sortOrder: 1 },
  { id: 'cat-daily', name: '日用品', type: 'expense', color: '#19a979', sortOrder: 2 },
  { id: 'cat-transport', name: '交通費', type: 'expense', color: '#1d7cd6', sortOrder: 3 },
  { id: 'cat-housing', name: '住居費', type: 'expense', color: '#945ecf', sortOrder: 4 },
  { id: 'cat-utility', name: '水道光熱費', type: 'expense', color: '#13a4b4', sortOrder: 5 },
  { id: 'cat-comm', name: '通信費', type: 'expense', color: '#6689c0', sortOrder: 6 },
  { id: 'cat-fun', name: '娯楽', type: 'expense', color: '#ec8ca4', sortOrder: 7 },
  { id: 'cat-medical', name: '医療', type: 'expense', color: '#bf399e', sortOrder: 8 },
  { id: 'cat-other-exp', name: 'その他', type: 'expense', color: '#8a8a85', sortOrder: 9 },
  { id: 'cat-salary', name: '給与', type: 'income', color: '#2f6f4f', sortOrder: 1 },
  { id: 'cat-side', name: '副業', type: 'income', color: '#5a9e6f', sortOrder: 2 },
  { id: 'cat-other-inc', name: 'その他収入', type: 'income', color: '#8a8a85', sortOrder: 3 },
];

export const SEED_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-cash', name: '現金', kind: 'cash', sortOrder: 1 },
  { id: 'pm-bank', name: '銀行口座', kind: 'bank', sortOrder: 2 },
];

export class KakeiboDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  recurringExpenses!: Table<RecurringExpense, string>;

  constructor() {
    super('kakeibo');

    // isActive のような boolean は IndexedDB のキーにできないため索引に含めない
    this.version(1).stores({
      transactions: 'id, date, type, categoryId, paymentMethodId, recurringSourceId',
      categories: 'id, type, sortOrder',
      paymentMethods: 'id, kind, sortOrder',
      recurringExpenses: 'id, categoryId, paymentMethodId',
    });

    // paymentMonthOffset の基準を「翌月 = 0」から「当月 = 0」に変更したため、
    // 既存レコードを 1 つずらして当月払いを表現できるようにする
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

    this.on('populate', async () => {
      await this.categories.bulkAdd(SEED_CATEGORIES);
      await this.paymentMethods.bulkAdd(SEED_PAYMENT_METHODS);
    });
  }
}

export const db = new KakeiboDB();

export const newId = () => crypto.randomUUID();
