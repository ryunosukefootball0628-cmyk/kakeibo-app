import { useState } from 'react';
import { Link } from 'react-router-dom';
import GripIcon from '../../components/GripIcon';
import {
  countTransactionsUsing,
  deletePaymentMethod,
  reorderPaymentMethods,
  savePaymentMethod,
} from '../../db/operations';
import { newId } from '../../db/seed';
import { useLookup, usePaymentMethods } from '../../hooks/useData';
import { useDragReorder } from '../../hooks/useDragReorder';
import { useFeatures } from '../../hooks/useFeatures';
import type { PaymentMethod, PaymentMethodKind } from '../../types';
import { cardsDebitedFrom, debitAccountOf } from '../../utils/balance';
import { closingRuleLabel } from '../../utils/billing';

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
  /** 引き落とし口座の id。空なら設定しない */
  debitAccountId: string;
}

export default function PaymentMethodsPage() {
  const paymentMethods = usePaymentMethods();
  const methodById = useLookup(paymentMethods);
  const sortable = useDragReorder(paymentMethods, reorderPaymentMethods);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  // 引き落とし口座は口座残高の機能の一部。使わない設定なら欄を出さない (設定済みの値は残す)
  const usesAccounts = useFeatures().isEnabled('accounts');

  const bankAccounts = paymentMethods.filter((m) => m.kind === 'bank');

  const openNew = () => {
    setError('');
    setForm({
      id: null,
      name: '',
      kind: 'credit_card',
      closingDay: '31',
      paymentDay: '27',
      paymentMonthOffset: '1',
      // 欄を出さないときは、利用者が見ていない口座を設定しない
      debitAccountId: usesAccounts ? (bankAccounts[0]?.id ?? '') : '',
    });
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
      // 引き落とし口座が消されたり銀行口座でなくなったりしていたら、未設定として開く
      debitAccountId: debitAccountOf(method, methodById)?.id ?? '',
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
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
    const isBank = form.kind === 'bank';
    savePaymentMethod({
      id: form.id ?? newId(),
      name: form.name.trim(),
      kind: form.kind,
      closingDay: isCard ? closingDay : undefined,
      paymentDay: isCard ? paymentDay : undefined,
      paymentMonthOffset: isCard ? Number(form.paymentMonthOffset) : undefined,
      debitAccountId: isCard && form.debitAccountId ? form.debitAccountId : undefined,
      // 残高は口座残高の画面で入力する。銀行口座のままなら引き継ぐ
      balanceDate: isBank ? existing?.balanceDate : undefined,
      balance: isBank ? existing?.balance : undefined,
      sortOrder:
        existing?.sortOrder ??
        Math.max(0, ...paymentMethods.map((m) => m.sortOrder)) + 1,
    });
    setForm(null);
  };

  const handleDelete = async (method: PaymentMethod) => {
    const usedCount = await countTransactionsUsing('paymentMethodId', method.id);
    const debitedCards = cardsDebitedFrom(method, paymentMethods);
    const notes = [
      usedCount > 0
        ? `「${method.name}」は${usedCount}件の取引で使われています。削除すると取引の支払い方法表示が「(削除済み)」になります。`
        : '',
      debitedCards.length > 0
        ? `「${method.name}」を引き落とし口座にしている${debitedCards.map((card) => `「${card.name}」`).join('')}は、引き落とし口座が未設定になります。`
        : '',
    ].join('');
    const message = notes ? `${notes}削除しますか?` : `「${method.name}」を削除しますか?`;
    if (!window.confirm(message)) return;
    deletePaymentMethod(method.id, paymentMethods);
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
                maxLength={100}
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
                {usesAccounts && (
                  <label className="field">
                    引き落とし口座
                    <select
                      value={form.debitAccountId}
                      onChange={(e) => setForm({ ...form, debitAccountId: e.target.value })}
                    >
                      {bankAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                      <option value="">設定しない</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </div>

          {form.kind === 'credit_card' && usesAccounts && (
            <p className="muted">
              引き落とし口座を選ぶと、支払日に請求予定額を「口座残高」の残高から引きます。
              {bankAccounts.length === 0 && '先に種別を「銀行口座」にした支払い方法を追加すると選べます。'}
            </p>
          )}
          {form.kind === 'bank' && usesAccounts && (
            <p className="muted">
              残高は「<Link to="/accounts">口座残高</Link>」の画面で入力します。
            </p>
          )}

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
                  <th></th>
                  <th>名称</th>
                  <th>種別</th>
                  <th>締め日 / 支払日</th>
                  {usesAccounts && <th>引き落とし口座</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody className={sortable.dragging ? 'sorting' : undefined}>
                {sortable.items.map((method, index) => (
                  <tr key={method.id} {...sortable.rowProps(method, index)}>
                    <td className="drag-cell">
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label={`「${method.name}」の並べ替え (↑↓ キーで移動)`}
                        title="ドラッグして並べ替え"
                        {...sortable.handleProps(method, index)}
                      >
                        <GripIcon />
                      </button>
                    </td>
                    <td>{method.name}</td>
                    <td>
                      <span className="tag">{KIND_LABEL[method.kind]}</span>
                    </td>
                    <td className="muted">
                      {method.kind === 'credit_card' &&
                      method.closingDay != null &&
                      method.paymentDay != null
                        ? closingRuleLabel({
                            closingDay: method.closingDay,
                            paymentDay: method.paymentDay,
                            paymentMonthOffset: method.paymentMonthOffset ?? 1,
                          })
                        : '—'}
                    </td>
                    {usesAccounts && (
                      <td className="muted">
                        {method.kind === 'credit_card'
                          ? (debitAccountOf(method, methodById)?.name ?? '未設定')
                          : '—'}
                      </td>
                    )}
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
