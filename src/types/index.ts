export type TransactionType = 'income' | 'expense';

export type PaymentMethodKind = 'cash' | 'bank' | 'credit_card';

export type RecurringCycle = 'monthly' | 'yearly';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** YYYY-MM-DD */
  date: string;
  /** 円単位の整数 */
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  memo?: string;
  /** 定期支出から記録された場合の参照元 */
  recurringSourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  sortOrder: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  /** 締め日 (1-31, credit_card のみ)。月末締めは 31 を指定 */
  closingDay?: number;
  /** 支払日 (1-31, credit_card のみ) */
  paymentDay?: number;
  /** 締め月から支払月までの差。0 = 当月払い, 1 = 翌月払い, 2 = 翌々月払い */
  paymentMonthOffset?: number;
  sortOrder: number;
}

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  cycle: RecurringCycle;
  /** 発生日 (1-31)。月末は 31 を指定 */
  dayOfMonth: number;
  /** 発生月 (1-12)。cycle === 'yearly' のときのみ使用 */
  monthOfYear?: number;
  isActive: boolean;
  memo?: string;
}

export interface BackupData {
  /** 1 = paymentMonthOffset が「翌月 = 0」基準の旧形式, 2 = 「当月 = 0」基準 */
  version: 1 | 2;
  exportedAt: string;
  transactions: Transaction[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  recurringExpenses: RecurringExpense[];
}
