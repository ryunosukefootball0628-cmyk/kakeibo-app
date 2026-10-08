import { useState } from 'react';
import { db, newId } from '../../db/db';
import { usePaymentMethods } from '../../hooks/useData';
import type { PaymentMethod, PaymentMethodKind } from '../../types';

const KIND_LABEL: Record<PaymentMethodKind, string> = {
  cash: '現金',
  bank: '銀行口座',
  credit_card: 'クレジットカード',
};

interface FormState {
  id: string | null;
  name: string;
  kind: PaymentMethodKind;
  closingDay: string;
  paymentDay: string;
  paymentMonthOffset: string;
}

const emptyForm: FormState = {
  id: null,
  name: '',
  kind: 'credit_card',
  closingDay: '31',
  paymentDay: '27',
  paymentMonthOffset: '1',
};

const OFFSET_LABEL: Record<string, string> = {
  '0': '当月',
  '1': '翌月',
  '2': '翌々月',
};

export default function PaymentMethodsPage() {
  const paymentMethods = usePaymentMethods();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');

  const openNew = () => {
    setError('');
    setForm(emptyForm);
  };

  const openEdit = (method: PaymentMethod) => {
    setError('');
    setForm({
      id: method.id,
      name: method.name,
      kind: method.kind,
      closingDay: String(method.closingDay ?? 31),
      paymentDay: String(method.paymentDay ?? 27),
      paymentMonthOffset: String(method.paymentMonthOffset ?? 1),
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      setError('名称を入力してください。');
      return;
    }

    const isCard = form.kind === 'credit_card';
    const closingDay = Number(form.closingDay);
    const paymentDay = Number(form.paymentDay);
    if (isCard) {
      const inRange = (n: number) => Number.isFinite(n) && n >= 1 && n <= 31;
      if (!inRange(closingDay) || !inRange(paymentDay)) {
        setError('締め日・支払日は 1〜31 で入力してください。');
        return;
      }
    }

    const existing = paymentMethods.find((m) => m.id === form.id);
    await db.paymentMethods.put({
      id: form.id ?? newId(),
      name: form.name.trim(),
      kind: form.kind,
      closingDay: isCard ? closingDay : undefined,
      paymentDay: isCard ? paymentDay : undefined,
      paymentMonthOffset: isCard ? Number(form.paymentMonthOffset) : undefined,
      sortOrder:
        existing?.sortOrder ??
        Math.max(0, ...paymentMethods.map((m) => m.sortOrder)) + 1,
    });
    setForm(null);
  };

  const handleDelete = async (method: PaymentMethod) => {
    const usedCount = await db.transactions
      .where('paymentMethodId')
      .equals(method.id)
      .count();
    const message =
      usedCount > 0
        ? `「${method.name}」は${usedCount}件の取引で使われています。削除すると取引の支払い方法表示が「(削除済み)」になります。削除しますか?`
        : `「${method.name}」を削除しますか?`;
    if (!window.confirm(message)) return;
    await db.paymentMethods.delete(method.id);
  };

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>支払い方法設定</h1>
        <button className="primary" onClick={openNew}>
          ＋ 追加
        </button>
      </div>

      {form && (
        <form className="card" onSubmit={handleSubmit}>
          <h2>{form.id ? '支払い方法を編集' : '支払い方法を追加'}</h2>
          <div className="form-grid">
            <label className="field">
              名称
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="〇〇カード"
                required
              />
            </label>
            <label className="field">
              種別
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as PaymentMethodKind })
                }
              >
                <option value="cash">現金</option>
                <option value="bank">銀行口座</option>
                <option value="credit_card">クレジットカード</option>
              </select>
            </label>
            {form.kind === 'credit_card' && (
              <>
                <label className="field">
                  締め日（31 を指定すると月末）
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.closingDay}
                    onChange={(e) =>
                      setForm({ ...form, closingDay: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  支払日（31 を指定すると月末）
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.paymentDay}
                    onChange={(e) =>
                      setForm({ ...form, paymentDay: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  支払いタイミング
                  <select
                    value={form.paymentMonthOffset}
                    onChange={(e) =>
                      setForm({ ...form, paymentMonthOffset: e.target.value })
                    }
                  >
                    <option value="0">締め月と同じ月（当月払い）</option>
                    <option value="1">締め月の翌月</option>
                    <option value="2">締め月の翌々月</option>
                  </select>
                </label>
              </>
            )}
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

      <div className="card">
        {paymentMethods.length === 0 ? (
          <p className="empty">支払い方法がありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>種別</th>
                  <th>締め日 / 支払日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.map((method) => (
                  <tr key={method.id}>
                    <td>{method.name}</td>
                    <td>
                      <span className="tag">{KIND_LABEL[method.kind]}</span>
                    </td>
                    <td className="muted">
                      {method.kind === 'credit_card' && method.closingDay != null
                        ? `${method.closingDay === 31 ? '月末' : `${method.closingDay}日`}締め / ${
                            OFFSET_LABEL[String(method.paymentMonthOffset ?? 1)]
                          }${method.paymentDay === 31 ? '月末' : `${method.paymentDay}日`}払い`
                        : '—'}
                    </td>
                    <td>
                      <span className="row">
                        <button className="small" onClick={() => openEdit(method)}>
                          編集
                        </button>
                        <button
                          className="small danger"
                          onClick={() => handleDelete(method)}
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
