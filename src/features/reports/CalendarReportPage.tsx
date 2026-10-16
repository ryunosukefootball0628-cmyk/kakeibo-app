import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MonthSelector from '../../components/MonthSelector';
import {
  useCategories,
  useLookup,
  usePaymentMethods,
  useTransactionsInMonth,
} from '../../hooks/useData';
import type { TransactionType } from '../../types';
import {
  currentYearMonth,
  dateLabel,
  datesOfMonth,
  todayIso,
  weekdayOf,
} from '../../utils/date';
import { formatCompactAmount, formatYen } from '../../utils/money';
import type { TransactionFormState } from '../transactions/TransactionFormPage';
import TransactionTable from '../transactions/TransactionTable';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type DayTotals = Record<TransactionType, number>;

const weekdayClass = (weekday: number) =>
  weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : '';

function dayAriaLabel(date: string, totals?: DayTotals): string {
  const parts = [dateLabel(date)];
  if (totals?.income) parts.push(`収入 ${formatYen(totals.income)}`);
  if (totals?.expense) parts.push(`支出 ${formatYen(totals.expense)}`);
  return parts.join(' ');
}

/** スマホ幅では枠に収まらないため、CSS で短い表記に切り替える */
function CellAmount({ type, amount }: { type: TransactionType; amount: number }) {
  const sign = type === 'income' ? '+' : '-';
  return (
    <span className={`calendar-amount ${type}`}>
      <span className="full">
        {sign}
        {formatYen(amount)}
      </span>
      <span className="short">
        {sign}
        {formatCompactAmount(amount)}
      </span>
    </span>
  );
}

export default function CalendarReportPage() {
  const navigate = useNavigate();
  // 編集画面から戻ったときに同じ月・同じ日を開けるよう、表示状態は URL に持たせる
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');
  const yearMonth =
    monthParam && YEAR_MONTH_PATTERN.test(monthParam) ? monthParam : currentYearMonth();

  const dates = useMemo(() => datesOfMonth(yearMonth), [yearMonth]);
  const today = todayIso();
  const dateParam = searchParams.get('date');
  const selected =
    dateParam && dates.includes(dateParam)
      ? dateParam
      : dates.includes(today)
        ? today
        : null;

  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const categoryById = useLookup(categories);
  const methodById = useLookup(paymentMethods);
  const transactions = useTransactionsInMonth(yearMonth);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, DayTotals>();
    for (const t of transactions) {
      const day = totals.get(t.date) ?? { income: 0, expense: 0 };
      day[t.type] += t.amount;
      totals.set(t.date, day);
    }
    return totals;
  }, [transactions]);

  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const dayTransactions = useMemo(
    () => transactions.filter((t) => t.date === selected),
    [transactions, selected],
  );
  const dayTotals = selected ? dailyTotals.get(selected) : undefined;

  const leadingBlanks = weekdayOf(dates[0]);
  const trailingBlanks = (7 - ((leadingBlanks + dates.length) % 7)) % 7;

  const show = (month: string, date?: string) => {
    // 月や日を切り替えるたびに履歴が積まれると「戻る」で画面を抜けにくいため置き換える
    setSearchParams(date ? { month, date } : { month }, { replace: true });
  };

  const returnTo = `/reports/calendar?month=${yearMonth}${selected ? `&date=${selected}` : ''}`;

  return (
    <>
      <h1>日別カレンダー</h1>
      <MonthSelector value={yearMonth} onChange={(ym) => show(ym)} />

      <div className="card calendar-card">
        <div className="spread" style={{ marginBottom: '0.75rem' }}>
          <span className="muted">月合計</span>
          <span className="row">
            <span className="income">収入 {formatYen(income)}</span>
            <span className="expense">支出 {formatYen(expense)}</span>
          </span>
        </div>

        <div className="calendar">
          {WEEKDAYS.map((label, i) => (
            <div key={label} className={`calendar-weekday ${weekdayClass(i)}`}>
              {label}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {dates.map((date) => {
            const totals = dailyTotals.get(date);
            return (
              <button
                key={date}
                type="button"
                className={`calendar-cell${date === today ? ' today' : ''}`}
                aria-pressed={date === selected}
                aria-label={dayAriaLabel(date, totals)}
                onClick={() => show(yearMonth, date)}
              >
                <span className={`calendar-day ${weekdayClass(weekdayOf(date))}`}>
                  {Number(date.slice(8))}
                </span>
                {totals?.income ? <CellAmount type="income" amount={totals.income} /> : null}
                {totals?.expense ? (
                  <CellAmount type="expense" amount={totals.expense} />
                ) : null}
              </button>
            );
          })}
          {Array.from({ length: trailingBlanks }, (_, i) => (
            <div key={`trail-${i}`} />
          ))}
        </div>
      </div>

      <div className="card">
        {selected === null ? (
          <p className="empty">日付を選ぶと、その日の取引を表示します。</p>
        ) : (
          <>
            <div className="spread" style={{ marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>{dateLabel(selected)}の取引</h2>
              <button
                className="small primary"
                onClick={() =>
                  navigate('/transactions/new', {
                    state: { date: selected, returnTo } satisfies TransactionFormState,
                  })
                }
              >
                ＋ この日に記録
              </button>
            </div>

            {dayTransactions.length === 0 ? (
              <p className="empty">この日の取引はありません。</p>
            ) : (
              <>
                <div className="spread" style={{ marginBottom: '0.5rem' }}>
                  <span className="muted">{dayTransactions.length}件</span>
                  <span className="row">
                    <span className="income">収入 {formatYen(dayTotals?.income ?? 0)}</span>
                    <span className="expense">支出 {formatYen(dayTotals?.expense ?? 0)}</span>
                  </span>
                </div>
                <TransactionTable
                  transactions={dayTransactions}
                  categoryById={categoryById}
                  methodById={methodById}
                  showDate={false}
                  returnTo={returnTo}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
