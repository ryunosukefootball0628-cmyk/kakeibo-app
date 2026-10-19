import type { Category, PaymentMethod } from '../types';

/** 初回ログイン時と初期化時に作るカテゴリ。ID を固定にして複数端末から同時に作っても重複しないようにする */
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

export const newId = () => crypto.randomUUID();
