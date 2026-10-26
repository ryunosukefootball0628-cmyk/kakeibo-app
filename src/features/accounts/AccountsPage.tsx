import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { recordRecurring, setAccountBalance } from '../../db/operations';
import { useAccountData } from '../../hooks/useAccounts';
import {
  useCategories,
  useLookup,
  useRecurrings,
  useSalaryTransactions,
} from '../../hooks/useData';
import { useFeatures } from '../../hooks/useFeatures';
import { usePayrollsBetween } from '../../hooks/usePayroll';
import type { Category, PaymentMethod, Transaction } from '../../types';
import {
  accountLedger,
  accountOutlook,
  balanceAt,
  cardsDebitedFrom,
  debitAccountOf,
  hasBalance,
  recurringForecasts,
  salaryForecasts,
  type Forecast,
  type LedgerEntry,
} from '../../utils/balance';
import { closingRuleLabel } from '../../utils/billing';
import {
  addMonths,
  dateLabel,
  monthRange,
  parseYearMonth,
  todayIso,
  toYearMonth,
  yearMonthsBetween,
} from '../../utils/date';
import { formatBalance, formatSignedYen, formatYen, MAX_AMOUNT } from '../../utils/money';
import { SALARY_HISTORY_MONTHS } from '../../utils/payroll';

/** 期間の表記に使う短い日付 (9/1) */
function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${m}/${d}`;
}

function entryKey({ date, source }: LedgerEntry): string {
  switch (source.type) {
    case 'transaction':
      return source.transaction.id;
    case 'card':
      return `card-${source.card.id}-${source.cycle.paymentYearMonth}`;
    case 'salary':
      return `salary-${source.payroll.workplace.id}-${source.payroll.cycle.paymentYearMonth}`;
    case 'recurring':
      return `recurring-${source.recurring.id}-${date}`;
  }
}

/** 入出金の内容。まだ記録していない給料・定期支出には、記録する操作を付ける */
function EntryLabel({
  entry,
  categoryById,
  today,
}: {
  entry: LedgerEntry;
  categoryById: Map<string, Category>;
  today: string;
}) {
  const { date, source } = entry;
  // 見込みのうち日付を過ぎたものは、まだ記録していない給料・定期支出
  const unrecorded = date <= today;
  const unrecordedTag = unrecorded && (
    <span className="tag" style={{ marginLeft: '0.4rem' }}>
      未記録
    </span>
  );

  switch (source.type) {
    case 'transaction': {
      const category = categoryById.get(source.transaction.categoryId);
      return (
        <>
          <span className="swatch" style={{ background: category?.color ?? '#8a8a85' }} />
          {category?.name ?? '(削除済み)'}
          {source.transaction.memo && (
            <span className="muted"> ・ {source.transaction.memo}</span>
          )}
        </>
      );
    }
    case 'card': {
      const { periodStart, periodEnd } = source.cycle;
      return (
        <>
          カードの引き落とし（{source.card.name}）
          <div className="muted">
            {shortDate(periodStart)}〜{shortDate(periodEnd)} の利用分
            {periodEnd >= today ? '（締め日前のため、利用が増えると変わります）' : '（概算）'}
          </div>
        </>
      );
    }
    case 'salary': {
      const { workplace, cycle } = source.payroll;
      const { month } = parseYearMonth(cycle.paymentYearMonth);
      return (
        <>
          <span className="swatch" style={{ background: workplace.color }} />
          給料（{workplace.name}）{unrecordedTag}
          <div className="muted">
            {month}月支給の見込み（シフトから計算した控除前の額）
            {unrecorded && (
              <>
                {' '}
                <Link to={`/salary?month=${cycle.paymentYearMonth}&record=${workplace.id}`}>
                  記録する
                </Link>
              </>
            )}
          </div>
        </>
      );
    }
    case 'recurring':
      return (
        <>
          {source.recurring.name}
          {unrecordedTag}
          <div className="muted">
            定期支出
            {unrecorded && (
              <>
                {' '}
                <button
                  className="small"
                  onClick={() => recordRecurring(source.recurring, date)}
                >
                  記録する
                </button>
              </>
            )}
          </div>
        </>
      );
  }
}

interface BalanceForm {
  date: string;
  balance: string;
}

interface AccountCardProps {
  account: PaymentMethod;
  methods: PaymentMethod[];
  transactions: Transaction[];
  /** 全口座の見込み。この口座の分だけを使う */
  forecasts: Forecast[];
  categoryById: Map<string, Category>;
  today: string;
  /** 見込みを出す最後の日 */
  until: string;
  /** 最近の入出金として出す最初の日 */
  recentStart: string;
  loading: boolean;
}

function AccountCard({
  account,
  methods,
  transactions,
  forecasts,
  categoryById,
  today,
  until,
  recentStart,
  loading,
}: AccountCardProps) {
  const balanced = hasBalance(account) ? account : null;
  const [form, setForm] = useState<BalanceForm | null>(null);
  const [error, setError] = useState('');

  const ledger = useMemo(
    () => (balanced ? accountLedger(balanced, methods, transactions, until) : []),
    [balanced, methods, transactions, until],
  );
  const outlook = useMemo(
    () =>
      balanced
        ? accountOutlook(
            balanced,
            ledger,
            today,
            forecasts.filter((f) => f.accountId === account.id).map((f) => f.item),
          )
        : [],
    [balanced, ledger, today, forecasts, account.id],
  );

  const cards = cardsDebitedFrom(account, methods);
  // 残高が未入力のあいだは、入力欄を最初から出しておく
  const shownForm = form ?? (balanced ? null : { date: today, balance: '' });

  const openForm = () => {
    setError('');
    setForm({ date: today, balance: '' });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!shownForm) return;
    const balance = Number(shownForm.balance);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shownForm.date) || shownForm.date > today) {
      setError('日付は今日以前の日を入力してください。');
      return;
    }
    if (shownForm.balance.trim() === '' || !Number.isInteger(balance) || balance < 0 || balance > MAX_AMOUNT) {
      setError('残高は 0 以上 1 兆円以下の整数で入力してください。');
      return;
    }
    setAccountBalance(account.id, shownForm.date, balance);
    setError('');
    setForm(null);
  };

  /** 入力した日の、アプリで計算した残高 (合わせた日より前は計算できない) */
  const computedOnFormDate =
    balanced && shownForm && shownForm.date >= balanced.balanceDate && shownForm.date <= today
      ? balanceAt(balanced, ledger, shownForm.date)
      : null;
  const enteredBalance =
    shownForm && shownForm.balance.trim() !== '' && Number.isInteger(Number(shownForm.balance))
      ? Number(shownForm.balance)
      : null;

  const renderForm = () =>
    shownForm && (
      <form className="subcard" onSubmit={handleSubmit}>
        <h3>{balanced ? '残高を合わせる' : '残高を入力する'}</h3>
        <p className="muted">
          通帳や銀行のアプリで確かめた残高を入れてください。その日までの入出金は残高に含まれているものとし、翌日からの入出金とカードの引き落としを足し引きします。
        </p>
        <div className="form-grid">
          <label className="field">
            日付
            <input
              type="date"
              max={today}
              value={shownForm.date}
              onChange={(e) => setForm({ ...shownForm, date: e.target.value })}
              required
            />
          </label>
          <label className="field">
            その日の残高（円）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_AMOUNT}
              step={1}
              value={shownForm.balance}
              onChange={(e) => setForm({ ...shownForm, balance: e.target.value })}
              required
            />
          </label>
        </div>
        {computedOnFormDate != null && !loading && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {enteredBalance === computedOnFormDate
              ? 'アプリで計算したこの日の残高と一致しています。'
              : `アプリで計算したこの日の残高は ${formatBalance(computedOnFormDate)} です${
                  enteredBalance != null
                    ? `（入力との差 ${formatSignedYen(enteredBalance - computedOnFormDate)}）`
                    : ''
                }。`}
          </p>
        )}
        {error && <p className="expense">{error}</p>}
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="primary" type="submit">
            保存する
          </button>
          {balanced && (
            <button type="button" onClick={() => setForm(null)}>
              キャンセル
            </button>
          )}
        </div>
      </form>
    );

  if (!balanced) {
    return (
      <div className="card">
        <h2>{account.name}</h2>
        <p className="muted">
          残高がまだ入力されていません。一度入力すると、その後の収入・支出とカードの引き落としから今日の残高を計算します。
        </p>
        {renderForm()}
      </div>
    );
  }

  const todayBalance = balanceAt(balanced, ledger, today);
  const endBalance = outlook.length > 0 ? outlook[outlook.length - 1].balance : todayBalance;
  const shortage = outlook.find((entry) => entry.balance < 0);
  const lowest = Math.min(...outlook.map((entry) => entry.balance));
  // 新しい順に並べる。合わせた日がこの範囲に入るなら、最後にその日の残高を出す
  const recent = ledger
    .filter((entry) => entry.date >= recentStart && entry.date <= today)
    .reverse();
  const showsBalanceDate = balanced.balanceDate >= recentStart;

  return (
    <div className="card">
      <h2 style={{ marginBottom: '0.25rem' }}>{account.name}</h2>
      <div className="balance-stats">
        <div>
          <div className="stat-label">今日の残高</div>
          <div className={`stat-value${todayBalance < 0 ? ' expense' : ''}`}>
            {loading ? '…' : formatBalance(todayBalance)}
          </div>
        </div>
        <div>
          <div className="stat-label">来月末の見込み</div>
          <div className={`stat-value${endBalance < 0 ? ' expense' : ''}`}>
            {loading ? '…' : formatBalance(endBalance)}
          </div>
        </div>
      </div>
      <div className="row muted">
        <span>
          {dateLabel(balanced.balanceDate)}に合わせた残高 {formatYen(balanced.balance)} から計算
        </span>
        {!form && (
          <button className="small" onClick={openForm}>
            残高を合わせる
          </button>
        )}
      </div>

      {renderForm()}

      {loading ? (
        <p className="loading">読み込み中…</p>
      ) : (
        <>
          {shortage && (
            <p className="expense">
              {shortage.date > today
                ? `${dateLabel(shortage.date)}に`
                : 'まだ記録していない入出金を入れると、'}
              残高が足りなくなる見込みです（最も少ないとき {formatBalance(lowest)}）。
            </p>
          )}

          <h3 style={{ marginTop: '1rem' }}>来月末までの予定</h3>
          {outlook.length === 0 ? (
            <p className="muted">来月末までの入出金の予定はありません。</p>
          ) : (
            <LedgerTable entries={outlook} categoryById={categoryById} today={today} />
          )}

          <details className="pay-details">
            <summary>最近の入出金（{recent.length}件）</summary>
            {recent.length === 0 && !showsBalanceDate ? (
              <p className="muted">先月からの入出金はありません。</p>
            ) : (
              <LedgerTable
                entries={recent}
                categoryById={categoryById}
                today={today}
                balanceDateRow={showsBalanceDate ? balanced : undefined}
              />
            )}
          </details>
        </>
      )}

      {cards.length > 0 && (
        <p className="muted" style={{ marginBottom: 0 }}>
          この口座から引き落とすカード：
          {cards
            .map((card) =>
              card.closingDay != null && card.paymentDay != null
                ? `${card.name}（${closingRuleLabel({
                    closingDay: card.closingDay,
                    paymentDay: card.paymentDay,
                    paymentMonthOffset: card.paymentMonthOffset ?? 1,
                  })}）`
                : `${card.name}（締め日・支払日が未設定のため引き落としを計算できません）`,
            )
            .join('、')}
        </p>
      )}
    </div>
  );
}

function LedgerTable({
  entries,
  categoryById,
  today,
  balanceDateRow,
}: {
  entries: LedgerEntry[];
  categoryById: Map<string, Category>;
  today: string;
  /** 最後の行に、残高を合わせた日の残高を出す */
  balanceDateRow?: { balanceDate: string; balance: number };
}) {
  // 狭い幅では残高の列を隠し、入出金の下に残高を出す (index.css の .ledger)
  const inlineBalance = (balance: number) => (
    <div className={`ledger-inline-balance${balance < 0 ? ' expense' : ''}`}>
      残高 {formatBalance(balance)}
    </div>
  );

  return (
    <div className="table-wrap ledger">
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>内容</th>
            <th style={{ textAlign: 'right' }}>入出金</th>
            <th className="ledger-balance" style={{ textAlign: 'right' }}>
              残高
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entryKey(entry)}>
              <td>{dateLabel(entry.date)}</td>
              <td className="ledger-label">
                <EntryLabel entry={entry} categoryById={categoryById} today={today} />
              </td>
              <td className={`amount ${entry.amount > 0 ? 'income' : 'expense'}`}>
                {formatSignedYen(entry.amount)}
                {inlineBalance(entry.balance)}
              </td>
              <td className={`amount ledger-balance${entry.balance < 0 ? ' expense' : ''}`}>
                {formatBalance(entry.balance)}
              </td>
            </tr>
          ))}
          {balanceDateRow && (
            <tr>
              <td>{dateLabel(balanceDateRow.balanceDate)}</td>
              <td className="ledger-label muted">残高を合わせた日</td>
              <td className="amount">{inlineBalance(balanceDateRow.balance)}</td>
              <td className="amount ledger-balance">
                {formatBalance(balanceDateRow.balance)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountsPage() {
  const today = todayIso();
  const thisMonth = toYearMonth(today);
  // 来月末までの残高の見込みを出す。記録していない給料・定期支出は前月の分から探す
  const outlookFrom = addMonths(thisMonth, -1);
  const outlookTo = addMonths(thisMonth, 1);
  const recentStart = monthRange(outlookFrom).start;
  const until = monthRange(outlookTo).end;

  // 定期支出を記録済みか確かめるため、前月の初めからの取引は必ず読む
  const { methods, accounts, transactions, loading } = useAccountData(until, {
    from: recentStart,
  });
  const methodById = useLookup(methods);
  const categories = useCategories();
  const categoryById = useLookup(categories);
  // 使わない設定の機能 (給料・定期支出) は見込みに入れない
  const features = useFeatures();
  const usesShifts = features.isEnabled('shifts');
  const usesRecurring = features.isEnabled('recurring');
  const recurrings = useRecurrings(usesRecurring);
  const { payrolls } = usePayrollsBetween(outlookFrom, outlookTo, usesShifts);
  const salaryTransactions = useSalaryTransactions(
    addMonths(thisMonth, -SALARY_HISTORY_MONTHS),
    outlookTo,
    usesShifts,
  );
  const forecastKinds = [
    usesShifts && 'まだ記録していない給料の見込み',
    usesRecurring && 'この口座から支払う定期支出',
  ].filter(Boolean);

  const forecasts = useMemo(
    () => [
      ...salaryForecasts(payrolls, salaryTransactions, methods),
      ...recurringForecasts(recurrings, transactions, yearMonthsBetween(outlookFrom, outlookTo)),
    ],
    [payrolls, salaryTransactions, methods, recurrings, transactions, outlookFrom, outlookTo],
  );

  const unlinkedCards = methods.filter(
    (m) => m.kind === 'credit_card' && !debitAccountOf(m, methodById),
  );

  if (loading && accounts.length === 0) {
    return (
      <>
        <h1>口座残高</h1>
        <p className="loading">読み込み中…</p>
      </>
    );
  }

  return (
    <>
      <h1>口座残高</h1>

      {accounts.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            銀行口座がまだ登録されていません。「支払い方法設定」で種別を「銀行口座」にして追加すると、残高を確認できます。
          </p>
          <Link to="/settings/payment-methods">
            <button className="primary">支払い方法設定へ</button>
          </Link>
        </div>
      ) : (
        accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            methods={methods}
            transactions={transactions}
            forecasts={forecasts}
            categoryById={categoryById}
            today={today}
            until={until}
            recentStart={recentStart}
            loading={loading}
          />
        ))
      )}

      {accounts.length > 0 && unlinkedCards.length > 0 && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            引き落とし口座を設定していないカード：{unlinkedCards.map((c) => c.name).join('、')}
          </p>
          <p className="muted">
            「支払い方法設定」でカードの引き落とし口座を選ぶと、支払日に請求予定額を口座の残高から引きます。
          </p>
          <Link to="/settings/payment-methods">
            <button>支払い方法設定へ</button>
          </Link>
        </div>
      )}

      {accounts.length > 0 && (
        <p className="muted">
          残高は、入力した日の残高に、翌日からの収入・支出（この口座を支払い方法・入金先にした取引）と、カードの引き落とし（請求予定額）を足し引きして計算します。ATM での引き出しや口座間の移動は記録できないため、通帳やアプリの残高とずれたら「残高を合わせる」で直してください。
          {forecastKinds.length > 0 && `予定には、${forecastKinds.join('と、')}も入れています。`}
        </p>
      )}
    </>
  );
}
