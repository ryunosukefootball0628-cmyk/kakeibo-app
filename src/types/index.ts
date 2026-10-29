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
  /** 給料として記録した場合の勤務先 */
  workplaceId?: string;
  /** 給料として記録した場合の支給月 (YYYY-MM)。見込みとの突き合わせに使う */
  payMonth?: string;
  /** 給与明細の総支給額 (amount は口座に入った手取り額) */
  grossPay?: number;
  /**
   * カードの請求に入れる支払月 (YYYY-MM)。締め日の近くの利用などが、明細で締め日から決まる月と
   * 違う月の請求になっていたときだけ持つ
   */
  billingMonth?: string;
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
  /** 引き落とし口座 (credit_card のみ)。kind が bank の支払い方法の id */
  debitAccountId?: string;
  /**
   * 残高を合わせた日 (bank のみ, YYYY-MM-DD)。この日までの入出金は balance に含まれているものとし、
   * 翌日からの入出金とカードの引き落としを足し引きして今の残高を出す
   */
  balanceDate?: string;
  /** balanceDate の終わりの時点の残高 (円)。balanceDate と組で持つ */
  balance?: number;
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

/** 勤務先 (アルバイト先など) */
export interface Workplace {
  id: string;
  name: string;
  /** カレンダーで見分けるための色 */
  color: string;
  /** 締め日 (1-31)。月末締めは 31 を指定 */
  closingDay: number;
  /** 給料日 (1-31)。月末払いは 31 を指定 */
  paymentDay: number;
  /** 締め月から給料日の月までの差。0 = 当月払い, 1 = 翌月払い, 2 = 翌々月払い */
  paymentMonthOffset: number;
  /** 深夜 (22時〜翌5時) の割増率 (%)。0 なら割増しない */
  nightPremiumPercent: number;
  /** 1日 8 時間を超えた分の割増率 (%)。0 なら割増しない */
  overtimePremiumPercent: number;
  /** false = 辞めたなどで、シフトの入力先に出さない */
  isActive: boolean;
  sortOrder: number;
}

/**
 * 勤務先の時給と交通費。変わるたびに適用開始日を付けて追加し、過去のシフトは当時の額で計算する。
 * 最も古い設定は、適用開始日より前のシフトにも使う。
 */
export interface PayRate {
  id: string;
  workplaceId: string;
  /** この日以降のシフトに適用する (YYYY-MM-DD) */
  startDate: string;
  /** 基本の時給 (円) */
  hourlyWage: number;
  /** 土曜の時給。未設定なら基本の時給 */
  saturdayWage?: number;
  /** 日曜の時給。未設定なら基本の時給 */
  sundayWage?: number;
  /** 祝日の時給。未設定なら曜日の時給 */
  holidayWage?: number;
  /** 出勤 1 日あたりの交通費 (円) */
  transportFee: number;
}

export interface Shift {
  id: string;
  workplaceId: string;
  /** 勤務を始める日 (YYYY-MM-DD)。日をまたぐシフトもこの日の分として扱う */
  date: string;
  /** HH:MM */
  startTime: string;
  /** HH:MM。開始より前 (または同じ) なら翌日の時刻 */
  endTime: string;
  /** 休憩 (分) */
  breakMinutes: number;
  memo?: string;
}

/** よく使うシフトの時間帯 (「早番」など) */
export interface ShiftTemplate {
  id: string;
  workplaceId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface BackupData {
  /**
   * 1 = paymentMonthOffset が「翌月 = 0」基準の旧形式, 2 = 「当月 = 0」基準,
   * 3 = シフト・給与 (workplaces など) を追加
   */
  version: 1 | 2 | 3;
  exportedAt: string;
  transactions: Transaction[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  recurringExpenses: RecurringExpense[];
  workplaces: Workplace[];
  payRates: PayRate[];
  shifts: Shift[];
  shiftTemplates: ShiftTemplate[];
}
