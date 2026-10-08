import { useMemo, useState } from 'react';
import MonthSelector from '../../components/MonthSelector';
import { db, newId } from '../../db/db';
import { recordRecurring } from '../../db/operations';
import {
  useCategories,
  useLookup,
  usePaymentMethods,
  useRecurrings,
  useTransactionsInMonth,
} from '../../hooks/useData';
import type { RecurringCycle, RecurringExpense } from '../../types';
import { currentYearMonth, dateLabel, yearMonthLabel } from '../../utils/date';
import { formatYen } from '../../utils/money';
import { pendingRecurrings } from '../../utils/recurring';

interface FormState {
  id: string | null;
  name: string;
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  cycle: RecurringCycle;
  dayOfMonth: string;
  monthOfYear: string;
  memo: string;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  amount: '',
  categoryId: '',
  paymentMethodId: '',
  cycle: 'monthly',
  dayOfMonth: '1',
  monthOfYear: '1',
  memo: '',
};

export default function RecurringPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');

  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const recurrings = useRecurrings();
  const categoryById = useLookup(categories);
  const methodById = useLookup(paymentMethods);
  const transactions = useTransactionsInMonth(yearMonth);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  );

  const pending = useMemo(
    () => pendingRecurrings(recurrings, transactions, yearMonth),
    [recurrings, transactions, yearMonth],
  );

  const openNew = () => {
    setError('');
    setForm({
      ...emptyForm,
      categoryId: expenseCategories[0]?.id ?? '',
      paymentMethodId: paymentMethods[0]?.id ?? '',
    });
  };

  const openEdit = (item: RecurringExpense) => {
    setError('');
    setForm({
      id: item.id,
      name: item.name,
      amount: String(item.amount),
      categoryId: item.categoryId,
      paymentMethodId: item.paymentMethodId,
      cycle: item.cycle,
      dayOfMonth: String(item.dayOfMonth),
      monthOfYear: String(item.monthOfYear ?? 1),
      memo: item.memo ?? '',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    const amount = Number(form.amount);
    const dayOfMonth = Number(form.dayOfMonth);
    if (!form.name.trim()) {
      setError('名称を入力してください。');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('金額は 1 以上の数値で入力してください。');
      return;
    }
    if (!form.categoryId || !form.paymentMethodId) {
      setError('カテゴリと支払い方法を選択してください。');
      return;
    }

    const record: RecurringExpense = {
      id: form.id ?? newId(),
      name: form.name.trim(),
      amount: Math.round(amount),
      categoryId: form.categoryId,
      paymentMethodId: form.paymentMethodId,
      cycle: form.cycle,
      dayOfMonth: Math.min(31, Math.max(1, Math.round(dayOfMonth))),
      monthOfYear:
        form.cycle === 'yearly' ? Number(form.monthOfYear) : undefined,
      isActive:
        recurrings.find((r) => r.id === form.id)?.isActive ?? true,
      memo: form.memo.trim() || undefined,
    };

    await db.recurringExpenses.put(record);
    setForm(null);
  };

  const toggleActive = async (item: RecurringExpense) => {
    await db.recurringExpenses.update(item.id, { isActive: !item.isActive });
  };

  const handleDelete = async (item: RecurringExpense) => {
    if (!window.confirm(`「${item.name}」を削除しますか?`)) return;
    await db.recurringExpenses.delete(item.id);
  };

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>定期支出・サブスク</h1>
        <button className="primary" onClick={openNew}>
          ＋ 追加
        </button>
      </div>

      {form && (
        <form className="card" onSubmit={handleSubmit}>
          <h2>{form.id ? '定期支出を編集' : '定期支出を追加'}</h2>
          <div className="form-grid">
            <label className="field">
              名称
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Netflix"
                required
              />
            </label>
            <label className="field">
              金額 (円)
              <input
                type="number"
                min={1}
                step={1}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </label>
            <label className="field">
              カテゴリ
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              支払い方法
              <select
                value={form.paymentMethodId}
                onChange={(e) =>
                  setForm({ ...form, paymentMethodId: e.target.value })
                }
              >
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              サイクル
              <select
                value={form.cycle}
                onChange={(e) =>
                  setForm({ ...form, cycle: e.target.value as RecurringCycle })
                }
              >
                <option value="monthly">毎月</option>
                <option value="yearly">毎年</option>
              </select>
            </label>
            {form.cycle === 'yearly' && (
              <label className="field">
                発生月
                <select
                  value={form.monthOfYear}
                  onChange={(e) =>
                    setForm({ ...form, monthOfYear: e.target.value })
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}月
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              発生日（31 を指定すると月末）
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
                required
              />
            </label>
            <label className="field">
              メモ
              <input
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="任意"
              />
            </label>
          </div>

          {error && <p className="expense">{error}</p>}

          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="primary" type="submit">
              保存する
            </button>
            <button type="button" onClick={() => setForm(null)}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      <MonthSelector value={yearMonth} onChange={setYearMonth} />

      <div className="card">
        <h2>{yearMonthLabel(yearMonth)}の未記録</h2>
        {pending.length === 0 ? (
          <p className="empty">未記録の定期支出はありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {pending.map(({ recurring, date }) => (
                  <tr key={recurring.id}>
                    <td>{dateLabel(date)}</td>
                    <td>{recurring.name}</td>
                    <td className="amount">{formatYen(recurring.amount)}</td>
                    <td>
                      <button
                        className="small primary"
                        onClick={() => recordRecurring(recurring, date)}
                      >
                        記録する
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>登録済みの定期支出</h2>
        {recurrings.length === 0 ? (
          <p className="empty">まだ登録がありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>サイクル</th>
                  <th>カテゴリ</th>
                  <th>支払い方法</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recurrings.map((item) => (
                  <tr key={item.id} style={{ opacity: item.isActive ? 1 : 0.55 }}>
                    <td>{item.name}</td>
                    <td className="muted">
                      {item.cycle === 'monthly'
                        ? `毎月 ${item.dayOfMonth}日`
                        : `毎年 ${item.monthOfYear}月${item.dayOfMonth}日`}
                    </td>
                    <td>{categoryById.get(item.categoryId)?.name ?? '(削除済み)'}</td>
                    <td>
                      {methodById.get(item.paymentMethodId)?.name ?? '(削除済み)'}
                    </td>
                    <td className="amount">{formatYen(item.amount)}</td>
                    <td>
                      <span className="tag">
                        {item.isActive ? '有効' : '停止中'}
                      </span>
                    </td>
                    <td>
                      <span className="row">
                        <button className="small" onClick={() => openEdit(item)}>
                          編集
                        </button>
                        <button className="small" onClick={() => toggleActive(item)}>
                          {item.isActive ? '停止' : '再開'}
                        </button>
                        <button
                          className="small danger"
                          onClick={() => handleDelete(item)}
                        >
                          削除
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
