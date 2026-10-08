import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisTick, tooltipStyle } from '../../components/chartTheme';
import MonthSelector from '../../components/MonthSelector';
import { useCategories, useLookup, useTransactionsBetween } from '../../hooks/useData';
import type { TransactionType } from '../../types';
import {
  addMonths,
  currentYearMonth,
  monthRange,
  recentYearMonths,
} from '../../utils/date';
import { formatYen } from '../../utils/money';

const TREND_MONTHS = 6;

export default function CategoryReportPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [type, setType] = useState<TransactionType>('expense');
  const categories = useCategories();
  const categoryById = useLookup(categories);

  const range = useMemo(
    () => ({
      start: monthRange(addMonths(yearMonth, -(TREND_MONTHS - 1))).start,
      end: monthRange(yearMonth).end,
    }),
    [yearMonth],
  );
  const transactions = useTransactionsBetween(range.start, range.end);

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.date.startsWith(yearMonth) && t.type === type),
    [transactions, yearMonth, type],
  );

  const total = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

  const breakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of monthTransactions) {
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

  const trend = useMemo(
    () =>
      recentYearMonths(yearMonth, TREND_MONTHS).map((ym) => {
        const inMonth = transactions.filter((t) => t.date.startsWith(ym));
        return {
          month: `${Number(ym.slice(5, 7))}月`,
          収入: inMonth
            .filter((t) => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0),
          支出: inMonth
            .filter((t) => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0),
        };
      }),
    [transactions, yearMonth],
  );

  return (
    <>
      <h1>カテゴリ別集計</h1>
      <MonthSelector value={yearMonth} onChange={setYearMonth} />

      <div className="card">
        <div className="spread">
          <div className="type-toggle" style={{ maxWidth: '12rem' }}>
            <button aria-pressed={type === 'expense'} onClick={() => setType('expense')}>
              支出
            </button>
            <button aria-pressed={type === 'income'} onClick={() => setType('income')}>
              収入
            </button>
          </div>
          <div>
            <span className="stat-label">合計 </span>
            <strong className={type === 'income' ? 'income' : 'expense'}>
              {formatYen(total)}
            </strong>
          </div>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <div className="card">
          <p className="empty">この月のデータがありません。</p>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            <h2>構成比</h2>
            <div className="chart-box">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="75%"
                    paddingAngle={2}
                  >
                    {breakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="var(--surface)" />
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
          </div>

          <div className="card">
            <h2>内訳</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>カテゴリ</th>
                    <th style={{ textAlign: 'right' }}>金額</th>
                    <th style={{ textAlign: 'right' }}>割合</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.name}>
                      <td>
                        <span className="swatch" style={{ background: row.color }} />
                        {row.name}
                      </td>
                      <td className="amount">{formatYen(row.value)}</td>
                      <td className="amount muted">
                        {total > 0 ? Math.round((row.value / total) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>月別推移（直近{TREND_MONTHS}ヶ月）</h2>
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={trend}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} stroke="var(--border)" />
              <YAxis
                tick={axisTick}
                stroke="var(--border)"
                width={70}
                tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => formatYen(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="収入" fill="var(--income)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="支出" fill="var(--expense)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
