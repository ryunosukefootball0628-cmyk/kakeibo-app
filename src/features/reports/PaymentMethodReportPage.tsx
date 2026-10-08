import { useMemo, useState } from 'react';
import MonthSelector from '../../components/MonthSelector';
import { usePaymentMethods, useTransactionsBetween } from '../../hooks/useData';
import {
  billingCycleForPaymentMonth,
  sumTransactionsInPeriod,
} from '../../utils/billing';
import {
  addMonths,
  currentYearMonth,
  monthRange,
  yearMonthLabel,
} from '../../utils/date';
import { formatYen } from '../../utils/money';

const UPCOMING_MONTHS = 3;

const KIND_LABEL: Record<string, string> = {
  cash: '現金',
  bank: '銀行口座',
  credit_card: 'クレジットカード',
};

export default function PaymentMethodReportPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const paymentMethods = usePaymentMethods();

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

  const upcoming = useMemo(
    () =>
      cards.map((method) => ({
        method,
        cycles: Array.from({ length: UPCOMING_MONTHS }, (_, i) =>
          billingCycleForPaymentMonth(method, addMonths(yearMonth, i)),
        ).flatMap((cycle) =>
          cycle
            ? [
                {
                  cycle,
                  amount: sumTransactionsInPeriod(
                    transactions,
                    method.id,
                    cycle.periodStart,
                    cycle.periodEnd,
                  ),
                },
              ]
            : [],
        ),
      })),
    [cards, yearMonth, transactions],
  );

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
          upcoming.map(({ method, cycles }) => (
            <div key={method.id} style={{ marginBottom: '1.25rem' }}>
              <h3>{method.name}</h3>
              {cycles.length === 0 ? (
                <p className="muted">締め日・支払日が未設定です。</p>
              ) : (
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
                      {cycles.map(({ cycle, amount }) => (
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
              )}
            </div>
          ))
        )}
        <p className="muted">
          締め日・支払日の設定にもとづく概算です。実際の請求額とは異なる場合があります。
        </p>
      </div>
    </>
  );
}
