import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { addTransaction, updateTransaction } from '../../db/operations';
import { useCategories, usePaymentMethods } from '../../hooks/useData';
import type { TransactionType } from '../../types';
import { todayIso } from '../../utils/date';

export default function TransactionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();

  const existing = useLiveQuery(
    async () => (id ? await db.transactions.get(id) : undefined),
    [id],
  );

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setType(existing.type);
    setDate(existing.date);
    setAmount(String(existing.amount));
    setCategoryId(existing.categoryId);
    setPaymentMethodId(existing.paymentMethodId);
    setMemo(existing.memo ?? '');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('金額は 1 以上の数値で入力してください。');
      return;
    }
    if (!categoryId || !paymentMethodId) {
      setError('カテゴリと支払い方法を選択してください。');
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
    };

    if (id) {
      await updateTransaction(id, input);
    } else {
      await addTransaction(input);
    }
    navigate('/transactions');
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
            支払い方法
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
            >
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            メモ
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
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
