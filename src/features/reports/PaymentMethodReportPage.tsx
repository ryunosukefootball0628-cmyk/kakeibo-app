import { useMemo, useState } from 'react';
import MonthSelector from '../../components/MonthSelector';
import {
  useCategories,
  useLookup,
  useMovedCardTransactions,
  usePaymentMethods,
  useTransactionsBetween,
} from '../../hooks/useData';
import { useFeatures } from '../../hooks/useFeatures';
import { debitAccountOf } from '../../utils/balance';
import { cardBill, withMovedCardTransactions } from '../../utils/billing';
import {
  addMonths,
  currentYearMonth,
  monthRange,
  yearMonthLabel,
} from '../../utils/date';
import { formatYen } from '../../utils/money';
import CardBillDetails from './CardBillDetails';

const UPCOMING_MONTHS = 3;

const KIND_LABEL: Record<string, string> = {
  cash: '現金',
  bank: '銀行口座',
  credit_card: 'クレジットカード',
};

export default function PaymentMethodReportPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const paymentMethods = usePaymentMethods();
  const methodById = useLookup(paymentMethods);
  const categories = useCategories();
  const categoryById = useLookup(categories);
  // 引き落とし口座は口座残高の機能の一部
  const usesAccounts = useFeatures().isEnabled('accounts');

  // 請求対象期間は過去に遡り、支払い予定は先月まで見るため広めに取得する
  const range = useMemo(
    () => ({
      start: monthRange(addMonths(yearMonth, -4)).start,
      end: monthRange(addMonths(yearMonth, UPCOMING_MONTHS)).end,
    }),
    [yearMonth],
  );
  const transactions = useTransactionsBetween(range.start, range.end);

  const monthTotals = useMemo(() => {
    const inMonth = transactions.filter(
      (t) => t.date.startsWith(yearMonth) && t.type === 'expense',
    );
    const total = inMonth.reduce((sum, t) => sum + t.amount, 0);
    return {
      total,
      rows: paymentMethods.map((method) => {
        const amount = inMonth
          .filter((t) => t.paymentMethodId === method.id)
          .reduce((sum, t) => sum + t.amount, 0);
        return { method, amount };
      }),
    };
  }, [transactions, paymentMethods, yearMonth]);

  const cards = useMemo(
    () => paymentMethods.filter((m) => m.kind === 'credit_card'),
    [paymentMethods],
  );

  // ほかの月の請求から移したカードの利用は、利用日が上の期間の外のことがあるので支払月で読む
  const movedCardTransactions = useMovedCardTransactions(
    yearMonth,
    addMonths(yearMonth, UPCOMING_MONTHS - 1),
    cards.length > 0,
  );

  const upcoming = useMemo(() => {
    const billed = withMovedCardTransactions(transactions, movedCardTransactions);
    return cards.map((method) => ({
      method,
      bills: Array.from({ length: UPCOMING_MONTHS }, (_, i) =>
        cardBill(method, billed, addMonths(yearMonth, i)),
      ).flatMap((bill) => (bill ? [bill] : [])),
    }));
  }, [cards, yearMonth, transactions, movedCardTransactions]);

  return (
    <>
      <h1>支払い方法別集計</h1>
      <MonthSelector value={yearMonth} onChange={setYearMonth} />

      <div className="card">
        <h2>{yearMonthLabel(yearMonth)}の支出（利用日ベース）</h2>
        {monthTotals.total === 0 ? (
          <p className="empty">この月の支出はまだありません。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>支払い方法</th>
                  <th>種別</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th style={{ textAlign: 'right' }}>割合</th>
                </tr>
              </thead>
              <tbody>
                {monthTotals.rows.map(({ method, amount }) => (
                  <tr key={method.id}>
                    <td>{method.name}</td>
                    <td>
                      <span className="tag">{KIND_LABEL[method.kind]}</span>
                    </td>
                    <td className="amount">{formatYen(amount)}</td>
                    <td className="amount muted">
                      {Math.round((amount / monthTotals.total) * 100)}%
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <strong>合計</strong>
                  </td>
                  <td className="amount">
                    <strong>{formatYen(monthTotals.total)}</strong>
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>カード請求予定額</h2>
        {cards.length === 0 ? (
          <p className="empty">
            クレジットカードが登録されていません。支払い方法設定から締め日・支払日を設定したカードを追加してください。
          </p>
        ) : (
          upcoming.map(({ method, bills }) => (
            <div key={method.id} style={{ marginBottom: '1.25rem' }}>
              <h3>
                {method.name}
                {usesAccounts && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: '0.5rem' }}>
                    引き落とし口座：{debitAccountOf(method, methodById)?.name ?? '未設定'}
                  </span>
                )}
              </h3>
              {bills.length === 0 ? (
                <p className="muted">締め日・支払日が未設定です。</p>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>支払月</th>
                          <th>対象期間</th>
                          <th>支払日</th>
                          <th style={{ textAlign: 'right' }}>請求予定額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map(({ cycle, amount }) => (
                          <tr key={cycle.paymentYearMonth}>
                            <td>{yearMonthLabel(cycle.paymentYearMonth)}</td>
                            <td className="muted">
                              {cycle.periodStart} 〜 {cycle.periodEnd}
                            </td>
                            <td>{cycle.paymentDate}</td>
                            <td className="amount">{formatYen(amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bills.map((bill) => (
                    <CardBillDetails
                      key={bill.cycle.paymentYearMonth}
                      card={method}
                      bill={bill}
                      categoryById={categoryById}
                      label={`${yearMonthLabel(bill.cycle.paymentYearMonth)}払いの内訳`}
                      returnTo="/reports/payment-methods"
                    />
                  ))}
                </>
              )}
            </div>
          ))
        )}
        <p className="muted">
          締め日・支払日の設定にもとづく概算です。実際の請求額とは異なる場合があります。締め日の近くの利用などが明細と違う月の請求になっていたら、内訳から支払月を移せます。
        </p>
      </div>
    </>
  );
}
