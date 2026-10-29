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
import { recordRecurring } from '../../db/operations';
import { useAccountData } from '../../hooks/useAccounts';
import {
  useCategories,
  useLookup,
  useMovedCardTransactions,
  usePaymentMethods,
  useRecurrings,
  useSalaryTransactions,
  useTransactionsBetween,
} from '../../hooks/useData';
import { useFeatures } from '../../hooks/useFeatures';
import { usePayrolls } from '../../hooks/usePayroll';
import {
  accountLedger,
  balanceAt,
  debitAccountOf,
  hasBalance,
} from '../../utils/balance';
import { cardBill, cardClosingRule, withMovedCardTransactions } from '../../utils/billing';
import {
  addMonths,
  currentYearMonth,
  dateLabel,
  monthRange,
  todayIso,
  yearMonthLabel,
} from '../../utils/date';
import { formatBalance, formatSignedYen, formatYen } from '../../utils/money';
import { pendingPayrolls } from '../../utils/payroll';
import { pendingRecurrings } from '../../utils/recurring';
import CardBillDetails from '../reports/CardBillDetails';

export default function DashboardPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  // 使わない設定の機能は、データを読まず表示もしない
  const features = useFeatures();
  const usesAccounts = features.isEnabled('accounts');
  const usesShifts = features.isEnabled('shifts');
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const recurrings = useRecurrings(features.isEnabled('recurring'));
  const categoryById = useLookup(categories);
  const methodById = useLookup(paymentMethods);

  // 口座の残高は選んだ月によらず今日の時点
  const today = todayIso();
  const accountData = useAccountData(today, { enabled: usesAccounts });
  const balances = useMemo(
    () =>
      accountData.accounts.filter(hasBalance).map((account) => ({
        account,
        balance: balanceAt(
          account,
          accountLedger(account, accountData.methods, accountData.transactions, today),
          today,
        ),
      })),
    [accountData.accounts, accountData.methods, accountData.transactions, today],
  );

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

  // ほかの月の請求からこの月へ移したカードの利用は、利用日が上の期間の外のことがあるので支払月で読む
  const movedCardTransactions = useMovedCardTransactions(
    yearMonth,
    yearMonth,
    paymentMethods.some((m) => cardClosingRule(m) != null),
  );
  const cardBills = useMemo(() => {
    const billed = withMovedCardTransactions(wideTransactions, movedCardTransactions);
    return paymentMethods.flatMap((method) => {
      const bill = cardBill(method, billed, yearMonth);
      return bill ? [{ method, bill }] : [];
    });
  }, [paymentMethods, yearMonth, wideTransactions, movedCardTransactions]);

  const pending = useMemo(
    () => pendingRecurrings(recurrings, monthTransactions, yearMonth),
    [recurrings, monthTransactions, yearMonth],
  );

  const { payrolls } = usePayrolls(yearMonth, usesShifts);
  const salaryTransactions = useSalaryTransactions(yearMonth, yearMonth, usesShifts);
  const pendingSalaries = useMemo(
    () => pendingPayrolls(payrolls, salaryTransactions, today),
    [payrolls, salaryTransactions, today],
  );

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>ダッシュボード</h1>
        <Link to="/transactions/new">
          <button className="primary">＋ 記録する</button>
        </Link>
      </div>

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

      {balances.length > 0 && (
        <div className="card">
          <div className="spread" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>今日の口座残高</h2>
            <Link to="/accounts">予定と明細を見る</Link>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {balances.map(({ account, balance }) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td className={`amount${balance < 0 ? ' expense' : ''}`}>
                      {accountData.loading ? '…' : formatBalance(balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingSalaries.length > 0 && (
        <div className="card">
          <h2>未記録の給料（{yearMonthLabel(yearMonth)}）</h2>
          <p className="muted">
            給料日を過ぎた給料です。振り込まれた額を確認して記録してください。
          </p>
          <div className="table-wrap">
            <table>
              <tbody>
                {pendingSalaries.map(({ workplace, cycle, summary }) => (
                  <tr key={workplace.id}>
                    <td>{dateLabel(cycle.paymentDate)}</td>
                    <td>
                      <span className="swatch" style={{ background: workplace.color }} />
                      {workplace.name}
                    </td>
                    <td className="amount">見込み {formatYen(summary.total)}</td>
                    <td>
                      <Link to={`/salary?month=${yearMonth}&record=${workplace.id}`}>
                        <button className="small primary">確認して記録</button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {cardBills.length > 0 && (
        <div className="card">
          <h2>{yearMonthLabel(yearMonth)}に支払うカード請求額</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>カード</th>
                  <th>対象期間</th>
                  <th>支払日</th>
                  {usesAccounts && <th>引き落とし口座</th>}
                  <th style={{ textAlign: 'right' }}>請求予定額</th>
                </tr>
              </thead>
              <tbody>
                {cardBills.map(({ method, bill: { cycle, amount } }) => (
                  <tr key={method.id}>
                    <td>{method.name}</td>
                    <td className="muted">
                      {cycle.periodStart} 〜 {cycle.periodEnd}
                    </td>
                    <td>{cycle.paymentDate}</td>
                    {usesAccounts && (
                      <td className="muted">
                        {debitAccountOf(method, methodById)?.name ?? '未設定'}
                      </td>
                    )}
                    <td className="amount">{formatYen(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cardBills.map(({ method, bill }) => (
            <CardBillDetails
              key={method.id}
              card={method}
              bill={bill}
              categoryById={categoryById}
              label={`${method.name}の内訳`}
              returnTo="/"
            />
          ))}
          <p className="muted">
            締め日・支払日の設定にもとづく概算です。実際の請求額とは異なる場合があります。締め日の近くの利用などが明細と違う月の請求になっていたら、内訳から支払月を移せます。
          </p>
        </div>
      )}
    </>
  );
}
