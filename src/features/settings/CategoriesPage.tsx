import { useState } from 'react';
import { db, newId } from '../../db/db';
import { useCategories } from '../../hooks/useData';
import type { Category, TransactionType } from '../../types';

const DEFAULT_COLOR = '#2f6f4f';

interface FormState {
  id: string | null;
  name: string;
  type: TransactionType;
  color: string;
}

export default function CategoriesPage() {
  const categories = useCategories();
  const [form, setForm] = useState<FormState | null>(null);

  const openNew = (type: TransactionType) =>
    setForm({ id: null, name: '', type, color: DEFAULT_COLOR });

  const openEdit = (category: Category) =>
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !form.name.trim()) return;

    const existing = categories.find((c) => c.id === form.id);
    const sameType = categories.filter((c) => c.type === form.type);

    await db.categories.put({
      id: form.id ?? newId(),
      name: form.name.trim(),
      type: form.type,
      color: form.color,
      sortOrder:
        existing?.sortOrder ??
        Math.max(0, ...sameType.map((c) => c.sortOrder)) + 1,
    });
    setForm(null);
  };

  const handleDelete = async (category: Category) => {
    const usedCount = await db.transactions
      .where('categoryId')
      .equals(category.id)
      .count();
    const message =
      usedCount > 0
        ? `「${category.name}」は${usedCount}件の取引で使われています。削除すると取引のカテゴリ表示が「(削除済み)」になります。削除しますか?`
        : `「${category.name}」を削除しますか?`;
    if (!window.confirm(message)) return;
    await db.categories.delete(category.id);
  };

  const renderGroup = (type: TransactionType, label: string) => {
    const items = categories.filter((c) => c.type === type);
    return (
      <div className="card">
        <div className="spread" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>{label}</h2>
          <button onClick={() => openNew(type)}>＋ 追加</button>
        </div>
        {items.length === 0 ? (
          <p className="empty">カテゴリがありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {items.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <span
                        className="swatch"
                        style={{ background: category.color }}
                      />
                      {category.name}
                    </td>
                    <td>
                      <span className="row">
                        <button
                          className="small"
                          onClick={() => openEdit(category)}
                        >
                          編集
                        </button>
                        <button
                          className="small danger"
                          onClick={() => handleDelete(category)}
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
    );
  };

  return (
    <>
      <h1>カテゴリ設定</h1>

      {form && (
        <form className="card" onSubmit={handleSubmit}>
          <h2>{form.id ? 'カテゴリを編集' : 'カテゴリを追加'}</h2>
          <div className="form-grid">
            <label className="field">
              名称
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="field">
              種別
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as TransactionType })
                }
              >
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </label>
            <label className="field">
              グラフの色
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </label>
          </div>
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

      {renderGroup('expense', '支出カテゴリ')}
      {renderGroup('income', '収入カテゴリ')}
    </>
  );
}
