import { useNavigate } from 'react-router-dom';
import { deleteTransaction } from '../../db/operations';
import type { Category, PaymentMethod, Transaction } from '../../types';
import { dateLabel } from '../../utils/date';
import { formatYen } from '../../utils/money';
import type { TransactionFormState } from './TransactionFormPage';

interface Props {
  transactions: Transaction[];
  categoryById: Map<string, Category>;
  methodById: Map<string, PaymentMethod>;
  /** 1日分だけを並べるときは日付列を省く */
  showDate?: boolean;
  /** 編集画面で保存したあとに戻る画面。未指定なら取引一覧 */
  returnTo?: string;
}

export default function TransactionTable({
  transactions,
  categoryById,
  methodById,
  showDate = true,
  returnTo,
}: Props) {
  const navigate = useNavigate();

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`「${label}」を削除しますか?`)) return;
    await deleteTransaction(id);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showDate && <th>日付</th>}
            <th>カテゴリ</th>
            <th>支払い方法</th>
            <th>メモ</th>
            <th style={{ textAlign: 'right' }}>金額</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const category = categoryById.get(t.categoryId);
            return (
              <tr key={t.id}>
                {showDate && <td>{dateLabel(t.date)}</td>}
                <td>
                  <span
                    className="swatch"
                    style={{ background: category?.color ?? '#8a8a85' }}
                  />
                  {category?.name ?? '(削除済み)'}
                </td>
                <td>{methodById.get(t.paymentMethodId)?.name ?? '(削除済み)'}</td>
                <td className="memo">{t.memo}</td>
                <td className={`amount ${t.type === 'income' ? 'income' : 'expense'}`}>
                  {t.type === 'income' ? '+' : '-'}
                  {formatYen(t.amount)}
                </td>
                <td>
                  <span className="row">
                    <button
                      className="small"
                      onClick={() =>
                        navigate(`/transactions/${t.id}/edit`, {
                          state: { returnTo } satisfies TransactionFormState,
                        })
                      }
                    >
                      編集
                    </button>
                    <button
                      className="small danger"
                      onClick={() =>
                        handleDelete(
                          t.id,
                          `${t.date} ${category?.name ?? ''} ${formatYen(t.amount)}`,
                        )
                      }
                    >
                      削除
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
