import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { addTransaction, updateTransaction } from '../../db/operations';
import {
  useCategories,
  usePaymentMethods,
  useTransaction,
} from '../../hooks/useData';
import type { TransactionType } from '../../types';
import { cardClosingRule, paymentMonthOfDate } from '../../utils/billing';
import { addMonths, todayIso, yearMonthLabel } from '../../utils/date';
import { formatYen, MAX_AMOUNT } from '../../utils/money';

/** カードの支払月として選べる月 (締め日どおりの月からの差) */
const BILLING_MONTH_CHOICES = [-1, 0, 1, 2];

/** 他の画面から登録・編集を開くときに navigate の state で渡せる値 */
export interface TransactionFormState {
  /** 新規登録時の日付の初期値 (YYYY-MM-DD) */
  date?: string;
  /** 保存後に戻る画面。未指定なら取引一覧 */
  returnTo?: string;
}

export default function TransactionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const formState = (useLocation().state ?? {}) as TransactionFormState;
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();

  const existing = useTransaction(id);

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(formState.date ?? todayIso());
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [memo, setMemo] = useState('');
  /** 明細に合わせて選んだカードの支払月。undefined なら締め日どおり */
  const [billingMonth, setBillingMonth] = useState<string>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setDate(existing.date);
    setAmount(String(existing.amount));
    setCategoryId(existing.categoryId);
    setPaymentMethodId(existing.paymentMethodId);
    setMemo(existing.memo ?? '');
    setBillingMonth(existing.billingMonth);
  }, [existing]);

  const selectableCategories = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  // 種別の切り替えや初期表示で、選択肢に無いカテゴリが残らないようにする
  useEffect(() => {
    if (selectableCategories.length === 0) return;
    if (!selectableCategories.some((c) => c.id === categoryId)) {
      setCategoryId(selectableCategories[0].id);
    }
  }, [selectableCategories, categoryId]);

  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length > 0) {
      setPaymentMethodId(paymentMethods[0].id);
    }
  }, [paymentMethods, paymentMethodId]);

  // カードの支出なら、明細に合わせて請求に入れる支払月を選べる。はじめは利用日と締め日から決まる月
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId);
  const closingRule =
    type === 'expense' && selectedMethod && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? cardClosingRule(selectedMethod)
      : null;
  const regularBillingMonth = closingRule && paymentMonthOfDate(closingRule, date);
  const billingMonthChoices = regularBillingMonth
    ? BILLING_MONTH_CHOICES.map((delta) => addMonths(regularBillingMonth, delta))
    : [];
  // 利用日を大きく直すなどして選べる月から外れたら、締め日どおりに戻す
  const selectedBillingMonth =
    billingMonth && billingMonthChoices.includes(billingMonth)
      ? billingMonth
      : regularBillingMonth;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('金額は 1 以上の数値で入力してください。');
      return;
    }
    if (Math.round(parsed) > MAX_AMOUNT) {
      setError(`金額は ${formatYen(MAX_AMOUNT)} 以下で入力してください。`);
      return;
    }
    if (!categoryId || !paymentMethodId) {
      setError('カテゴリと支払い方法を選択してください。');
      return;
    }
    // 読み込み前に保存すると、定期支出との紐づけ (recurringSourceId) が消えてしまう
    if (id && !existing) {
      setError('取引を読み込めていません。削除された可能性があります。');
      return;
    }

    const input = {
      type,
      date,
      amount: Math.round(parsed),
      categoryId,
      paymentMethodId,
      memo: memo.trim() || undefined,
      recurringSourceId: existing?.recurringSourceId,
      // 締め日どおりの月なら持たない
      billingMonth:
        selectedBillingMonth && selectedBillingMonth !== regularBillingMonth
          ? selectedBillingMonth
          : undefined,
    };

    if (id) {
      updateTransaction(id, input);
    } else {
      addTransaction(input);
    }
    navigate(formState.returnTo ?? '/transactions');
  };

  return (
    <>
      <h1>{id ? '取引を編集' : '取引を記録'}</h1>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            種別
            <div className="type-toggle">
              <button
                type="button"
                aria-pressed={type === 'expense'}
                onClick={() => setType('expense')}
              >
                支出
              </button>
              <button
                type="button"
                aria-pressed={type === 'income'}
                onClick={() => setType('income')}
              >
                収入
              </button>
            </div>
          </div>

          <label className="field">
            日付
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <label className="field">
            金額 (円)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_AMOUNT}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              required
            />
          </label>

          <label className="field">
            カテゴリ
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {selectableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            {type === 'income' ? '入金先' : '支払い方法'}
            <select
              value={paymentMethodId}
              onChange={(e) => {
                setPaymentMethodId(e.target.value);
                // 支払月はカードごとの請求の月なので、支払い方法を変えたら締め日どおりに戻す
                setBillingMonth(undefined);
              }}
            >
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          {billingMonthChoices.length > 0 && (
            <label className="field">
              カードの支払月
              <select
                value={selectedBillingMonth ?? ''}
                onChange={(e) => setBillingMonth(e.target.value)}
              >
                {billingMonthChoices.map((month) => (
                  <option key={month} value={month}>
                    {`${yearMonthLabel(month)}払い${month === regularBillingMonth ? '（締め日どおり）' : ''}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            メモ
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={1000}
              placeholder="任意"
            />
          </label>
        </div>

        {error && (
          <p className="expense" style={{ marginBottom: 0 }}>
            {error}
          </p>
        )}

        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="primary" type="submit">
            {id ? '更新する' : '記録する'}
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            キャンセル
          </button>
        </div>
      </form>
    </>
  );
}
