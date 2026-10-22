import { useMemo, useState } from 'react';
import {
  countTransactionsUsing,
  deleteCategory,
  reorderCategories,
  saveCategory,
} from '../../db/operations';
import { newId } from '../../db/seed';
import { useCategories } from '../../hooks/useData';
import { useDragReorder } from '../../hooks/useDragReorder';
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

  const expenses = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  );
  const incomes = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  );

  const openNew = (type: TransactionType) =>
    setForm({ id: null, name: '', type, color: DEFAULT_COLOR });

  const openEdit = (category: Category) =>
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !form.name.trim()) return;

    const existing = categories.find((c) => c.id === form.id);
    const sameType = categories.filter((c) => c.type === form.type);

    saveCategory({
      id: form.id ?? newId(),
      name: form.name.trim(),
      type: form.type,
      color: form.color,
      // 新しく作ったときと種別を変えたときは、その種別の末尾に並べる
      sortOrder:
        existing?.type === form.type
          ? existing.sortOrder
          : Math.max(0, ...sameType.map((c) => c.sortOrder)) + 1,
    });
    setForm(null);
  };

  const handleDelete = async (category: Category) => {
    const usedCount = await countTransactionsUsing('categoryId', category.id);
    const message =
      usedCount > 0
        ? `「${category.name}」は${usedCount}件の取引で使われています。削除すると取引のカテゴリ表示が「(削除済み)」になります。削除しますか?`
        : `「${category.name}」を削除しますか?`;
    if (!window.confirm(message)) return;
    deleteCategory(category.id);
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

      <CategoryGroup
        label="支出カテゴリ"
        items={expenses}
        onAdd={() => openNew('expense')}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
      <CategoryGroup
        label="収入カテゴリ"
        items={incomes}
        onAdd={() => openNew('income')}
        onEdit={openEdit}
        onDelete={handleDelete}
      />
    </>
  );
}

interface CategoryGroupProps {
  label: string;
  items: Category[];
  onAdd: () => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

function CategoryGroup({ label, items, onAdd, onEdit, onDelete }: CategoryGroupProps) {
  const sortable = useDragReorder(items, reorderCategories);

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>{label}</h2>
        <button onClick={onAdd}>＋ 追加</button>
      </div>
      {items.length === 0 ? (
        <p className="empty">カテゴリがありません。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <tbody className={sortable.dragging ? 'sorting' : undefined}>
              {sortable.items.map((category, index) => (
                <tr key={category.id} {...sortable.rowProps(category, index)}>
                  <td className="drag-cell">
                    <button
                      type="button"
                      className="drag-handle"
                      aria-label={`「${category.name}」の並べ替え (↑↓ キーで移動)`}
                      title="ドラッグして並べ替え"
                      {...sortable.handleProps(category, index)}
                    >
                      <GripIcon />
                    </button>
                  </td>
                  <td>
                    <span
                      className="swatch"
                      style={{ background: category.color }}
                    />
                    {category.name}
                  </td>
                  <td>
                    <span className="row">
                      <button className="small" onClick={() => onEdit(category)}>
                        編集
                      </button>
                      <button
                        className="small danger"
                        onClick={() => onDelete(category)}
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
}

/** ドラッグのつまみ (縦 3 × 横 2 の点) */
function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      {[3, 8, 13].flatMap((y) =>
        [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
      )}
    </svg>
  );
}
