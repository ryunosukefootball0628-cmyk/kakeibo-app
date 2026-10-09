import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { tooltipStyle } from '../../components/chartTheme';
import MonthSelector from '../../components/MonthSelector';
import StorageNotice from '../../components/StorageNotice';
import { recordRecurring } from '../../db/operations';
import {
  useCategories,
  useLookup,
  usePaymentMethods,
  useRecurrings,
  useTransactionCount,
  useTransactionsBetween,
} from '../../hooks/useData';
import {
  billingCycleForPaymentMonth,
  sumTransactionsInPeriod,
} from '../../utils/billing';
import {
  addMonths,
  currentYearMonth,
  dateLabel,
  monthRange,
  yearMonthLabel,
} from '../../utils/date';
import { formatSignedYen, formatYen } from '../../utils/money';
import { pendingRecurrings } from '../../utils/recurring';

export default function DashboardPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const recurrings = useRecurrings();
  const categoryById = useLookup(categories);
  const transactionCount = useTransactionCount();

  // カードの請求対象期間は前月以前に遡るため、数ヶ月分まとめて取得する
  const wideRange = useMemo(
    () => ({
      start: monthRange(addMonths(yearMonth, -3)).start,
      end: monthRange(yearMonth).end,
    }),
    [yearMonth],
  );
  const wideTransactions = useTransactionsBetween(wideRange.start, wideRange.end);

  const monthTransactions = useMemo(
    () => wideTransactions.filter((t) => t.date.startsWith(yearMonth)),
    [wideTransactions, yearMonth],
  );

  const income = monthTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthTransactions) {
      if (t.type !== 'expense') continue;
      totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
    }
    return [...totals.entries()]
      .map(([categoryId, value]) => ({
        name: categoryById.get(categoryId)?.name ?? '(削除済み)',
        color: categoryById.get(categoryId)?.color ?? '#8a8a85',
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthTransactions, categoryById]);

  const methodBreakdown = useMemo(
    () =>
      paymentMethods
        .map((method) => ({
          method,
          total: monthTransactions
            .filter((t) => t.type === 'expense' && t.paymentMethodId === method.id)
            .reduce((sum, t) => sum + t.amount, 0),
        }))
        .filter((row) => row.total > 0),
    [paymentMethods, monthTransactions],
  );

  const cardBillings = useMemo(
    () =>
      paymentMethods.flatMap((method) => {
        const cycle = billingCycleForPaymentMonth(method, yearMonth);
        if (!cycle) return [];
        return [
          {
            method,
            cycle,
            amount: sumTransactionsInPeriod(
              wideTransactions,
              method.id,
              cycle.periodStart,
              cycle.periodEnd,
            ),
          },
        ];
      }),
    [paymentMethods, yearMonth, wideTransactions],
  );

  const pending = useMemo(
    () => pendingRecurrings(recurrings, monthTransactions, yearMonth),
    [recurrings, monthTransactions, yearMonth],
  );

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>ダッシュボード</h1>
        <Link to="/transactions/new">
          <button className="primary">＋ 記録する</button>
        </Link>
      </div>

      <StorageNotice transactionCount={transactionCount} />

      <MonthSelector value={yearMonth} onChange={setYearMonth} />

      <div className="grid">
        <div className="card">
          <div className="stat-label">収入</div>
          <div className="stat-value income">{formatYen(income)}</div>
        </div>
        <div className="card">
          <div className="stat-label">支出</div>
          <div className="stat-value expense">{formatYen(expense)}</div>
        </div>
        <div className="card">
          <div className="stat-label">収支</div>
          <div
            className={`stat-value ${income - expense >= 0 ? 'income' : 'expense'}`}
          >
            {formatSignedYen(income - expense)}
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h2>未記録の定期支出（{yearMonthLabel(yearMonth)}）</h2>
          <p className="muted">
            発生予定の定期支出です。内容を確認して記録してください。
          </p>
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
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h2>カテゴリ別支出</h2>
          {categoryBreakdown.length === 0 ? (
            <p className="empty">この月の支出はまだありません。</p>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="75%"
                    paddingAngle={2}
                  >
                    {categoryBreakdown.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        stroke="var(--surface)"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => formatYen(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2>支払い方法別支出</h2>
          {methodBreakdown.length === 0 ? (
            <p className="empty">この月の支出はまだありません。</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {methodBreakdown.map(({ method, total }) => (
                    <tr key={method.id}>
                      <td>{method.name}</td>
                      <td className="amount">{formatYen(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {cardBillings.length > 0 && (
        <div className="card">
          <h2>{yearMonthLabel(yearMonth)}に支払うカード請求額</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>カード</th>
                  <th>対象期間</th>
                  <th>支払日</th>
                  <th style={{ textAlign: 'right' }}>請求予定額</th>
                </tr>
              </thead>
              <tbody>
                {cardBillings.map(({ method, cycle, amount }) => (
                  <tr key={method.id}>
                    <td>{method.name}</td>
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
          <p className="muted">
            締め日・支払日の設定にもとづく概算です。実際の請求額とは異なる場合があります。
          </p>
        </div>
      )}
    </>
  );
}
