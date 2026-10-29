import { Link } from 'react-router-dom';
import { setBillingMonth } from '../../db/operations';
import type { Category, PaymentMethod } from '../../types';
import {
  billingMonthOf,
  cardClosingRule,
  paymentMonthOfDate,
  type CardBill,
} from '../../utils/billing';
import { addMonths, dateLabel, parseYearMonth, shortDate } from '../../utils/date';
import { formatYen } from '../../utils/money';
import type { TransactionFormState } from '../transactions/TransactionFormPage';

/** "12月払い" */
const monthLabel = (yearMonth: string) => `${parseYearMonth(yearMonth).month}月払い`;

interface Props {
  card: PaymentMethod;
  bill: CardBill;
  categoryById: Map<string, Category>;
  /** 開閉の見出し (「〇〇カードの内訳」など)。後ろに件数を付ける */
  label: string;
  /** 日付から取引の編集を開いたとき、保存後に戻る画面 */
  returnTo: string;
}

/**
 * カードの請求の内訳。締め日の近くの利用などがカードの明細で次の月の請求になっていたら、
 * 利用ごとにその月の請求へ移したり、締め日どおりの月に戻したりできる
 */
export default function CardBillDetails({ card, bill, categoryById, label, returnTo }: Props) {
  const rule = cardClosingRule(card);
  if (!rule || (bill.items.length === 0 && bill.movedOut.length === 0)) return null;

  const { paymentYearMonth, periodEnd } = bill.cycle;
  const next = addMonths(paymentYearMonth, 1);
  // ほかの月へ移した利用も、締め日どおりなら入るこの請求の中に、日付の新しい順で並べる
  const rows = [
    ...bill.items.map((transaction) => ({ transaction, movedOut: false })),
    ...bill.movedOut.map((transaction) => ({ transaction, movedOut: true })),
  ].sort(
    (a, b) =>
      b.transaction.date.localeCompare(a.transaction.date) ||
      b.transaction.createdAt.localeCompare(a.transaction.createdAt),
  );

  return (
    <details className="pay-details">
      <summary>
        {label}（{bill.items.length}件
        {bill.movedOut.length > 0 && `・ほかの月へ移した ${bill.movedOut.length}件`}）
      </summary>
      <p className="muted">
        締め日（{shortDate(periodEnd)}）の近くの利用は、カード会社への連絡が遅れて次の月の請求になることがあります。カードの明細と違うときは「{monthLabel(next)}へ移す」で移せます。ほかの月にするときは、日付を押して取引を編集してください。
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>利用日</th>
              <th>内容</th>
              <th style={{ textAlign: 'right' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ transaction: t, movedOut }) => {
              const category = categoryById.get(t.categoryId);
              const regularMonth = paymentMonthOfDate(rule, t.date);
              const moved = movedOut || regularMonth !== paymentYearMonth;
              return (
                <tr key={t.id} className={movedOut ? 'moved-out' : undefined}>
                  <td>
                    <Link
                      to={`/transactions/${t.id}/edit`}
                      state={{ returnTo } satisfies TransactionFormState}
                    >
                      {dateLabel(t.date)}
                    </Link>
                  </td>
                  <td className="bill-item">
                    <span
                      className="swatch"
                      style={{ background: category?.color ?? '#8a8a85' }}
                    />
                    {category?.name ?? '(削除済み)'}
                    {t.memo && <span className="muted"> ・ {t.memo}</span>}
                    <div className="row bill-item-actions">
                      {moved && (
                        <span className="tag">
                          {movedOut
                            ? `${monthLabel(billingMonthOf(t, rule))}へ移動`
                            : `${monthLabel(regularMonth)}から移動`}
                        </span>
                      )}
                      {/* 次の月が締め日どおりの月なら、下の「戻す」と同じなので出さない */}
                      {!movedOut && next !== regularMonth && (
                        <button className="small" onClick={() => setBillingMonth(t.id, next)}>
                          {monthLabel(next)}へ移す
                        </button>
                      )}
                      {moved && (
                        <button className="small" onClick={() => setBillingMonth(t.id, undefined)}>
                          {monthLabel(regularMonth)}に戻す
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="amount">{formatYen(t.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
