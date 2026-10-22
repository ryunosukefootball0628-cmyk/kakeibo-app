import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MonthSelector from '../../components/MonthSelector';
import { recordSalary } from '../../db/operations';
import {
  useCategories,
  usePaymentMethods,
  useSalaryTransactions,
} from '../../hooks/useData';
import { usePayrolls } from '../../hooks/usePayroll';
import type { Category, PaymentMethod, Transaction } from '../../types';
import {
  addMonths,
  dateLabel,
  parseYearMonth,
  todayIso,
  yearMonthOrCurrent,
} from '../../utils/date';
import { formatSignedYen, formatYen, MAX_AMOUNT } from '../../utils/money';
import {
  SALARY_HISTORY_MONTHS,
  salaryDepositAccountId,
  salaryRecordsFor,
  shiftPayYen,
  type Payroll,
} from '../../utils/payroll';
import { durationLabel, timeRangeLabel } from '../../utils/shift';
import type { TransactionFormState } from '../transactions/TransactionFormPage';

interface RecordForm {
  date: string;
  amount: string;
  grossPay: string;
  categoryId: string;
  paymentMethodId: string;
  memo: string;
}

function initialRecordForm(
  payroll: Payroll,
  history: Transaction[],
  categories: Category[],
  paymentMethods: PaymentMethod[],
): RecordForm {
  // 前回この勤務先の給料を記録したときと同じカテゴリ・入金先にする
  const previous = history.find((t) => t.workplaceId === payroll.workplace.id);
  const incomes = categories.filter((c) => c.type === 'income');
  const categoryId =
    previous?.categoryId ??
    (incomes.find((c) => c.id === 'cat-salary') ?? incomes[0])?.id ??
    '';
  // 口座残高の画面で給料の見込みを入れる口座と同じにする
  const paymentMethodId = salaryDepositAccountId(payroll.workplace.id, history, paymentMethods);
  const { month } = parseYearMonth(payroll.cycle.paymentYearMonth);
  return {
    date: payroll.cycle.paymentDate,
    amount: String(payroll.summary.total),
    grossPay: '',
    categoryId,
    paymentMethodId,
    memo: `${payroll.workplace.name}の給料（${month}月支給）`,
  };
}

const parseAmount = (text: string) => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT ? n : null;
};

export default function SalaryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const yearMonth = yearMonthOrCurrent(searchParams.get('month'));
  // ダッシュボードの「確認して記録」から来たときは、その勤務先の記録フォームを開く
  const recordParam = searchParams.get('record');

  const { payrolls, workplaces } = usePayrolls(yearMonth);
  const salaryTransactions = useSalaryTransactions(
    addMonths(yearMonth, -SALARY_HISTORY_MONTHS),
    yearMonth,
  );
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  );

  /**
   * 記録フォームを開いている勤務先と、入力で変えた項目。
   * 変えていない項目は見込みなどから毎回求める (シフトなどの読み込みが後から届いても反映される)
   */
  const [recording, setRecording] = useState<{
    workplaceId: string;
    changes: Partial<RecordForm>;
  } | null>(() => (recordParam ? { workplaceId: recordParam, changes: {} } : null));
  const [error, setError] = useState('');

  // 開いたあとは URL から外し、再読み込みや月の切り替えで開き直さないようにする
  useEffect(() => {
    if (recordParam) setSearchParams({ month: yearMonth }, { replace: true });
  }, [recordParam, yearMonth, setSearchParams]);

  const today = todayIso();
  const returnTo = `/salary?month=${yearMonth}`;

  const rows = useMemo(
    () =>
      payrolls
        .map((payroll) => ({
          payroll,
          records: salaryRecordsFor(salaryTransactions, payroll.workplace.id, yearMonth),
        }))
        // 退職した勤務先は、この月に給料があるときだけ出す
        .filter(
          ({ payroll, records }) =>
            payroll.workplace.isActive || payroll.pays.length > 0 || records.length > 0,
        ),
    [payrolls, salaryTransactions, yearMonth],
  );

  const estimateTotal = rows.reduce((sum, { payroll }) => sum + payroll.summary.total, 0);
  const recordedTotal = rows.reduce(
    (sum, { records }) => sum + records.reduce((s, t) => s + t.amount, 0),
    0,
  );

  const changeMonth = (month: string) => {
    setRecording(null);
    setSearchParams({ month }, { replace: true });
  };

  const openRecord = (payroll: Payroll) => {
    setError('');
    setRecording({ workplaceId: payroll.workplace.id, changes: {} });
  };

  const recordingPayroll = payrolls.find((p) => p.workplace.id === recording?.workplaceId);
  const form: RecordForm | null =
    recording && recordingPayroll
      ? {
          ...initialRecordForm(recordingPayroll, salaryTransactions, categories, paymentMethods),
          ...recording.changes,
        }
      : null;

  const handleRecord = (event: React.FormEvent) => {
    event.preventDefault();
    if (!recording || !form) return;
    const { workplaceId } = recording;
    const amount = parseAmount(form.amount);
    const grossPay = form.grossPay.trim() === '' ? undefined : parseAmount(form.grossPay);
    if (amount === null || amount === 0) {
      setError('振り込まれた額は 1 以上 1 兆円以下の整数で入力してください。');
      return;
    }
    if (grossPay === null) {
      setError('総支給額は 0 以上 1 兆円以下の整数で入力してください（わからなければ空欄）。');
      return;
    }
    if (!form.date || !form.categoryId || !form.paymentMethodId) {
      setError('入金日・カテゴリ・入金先を選んでください。');
      return;
    }
    recordSalary({
      workplaceId,
      payMonth: yearMonth,
      date: form.date,
      amount,
      grossPay,
      categoryId: form.categoryId,
      paymentMethodId: form.paymentMethodId,
      memo: form.memo.trim() || undefined,
    });
    setRecording(null);
  };

  const updateForm = (changes: Partial<RecordForm>) =>
    recording &&
    setRecording({ ...recording, changes: { ...recording.changes, ...changes } });

  return (
    <>
      <h1>給与</h1>
      <MonthSelector value={yearMonth} onChange={changeMonth} />

      {workplaces.length === 0 ? (
        <div className="card">
          <p>給料の見込みを出すには、まず勤務先と時給を登録してください。</p>
          <Link to="/settings/workplaces">
            <button className="primary">勤務先を登録する</button>
          </Link>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            <div className="stat-label">この月に支給される給料（見込み）</div>
            <div className="stat-value income">{formatYen(estimateTotal)}</div>
          </div>
          <div className="card">
            <div className="stat-label">記録した振込額</div>
            <div className="stat-value">{formatYen(recordedTotal)}</div>
          </div>
        </div>
      )}

      {rows.map(({ payroll, records }) => {
        const { workplace, cycle, summary, pays } = payroll;
        const isRecording = recording?.workplaceId === workplace.id;
        const recordedAmount = records.reduce((sum, t) => sum + t.amount, 0);
        const recordedGross = records.some((t) => t.grossPay != null)
          ? records.reduce((sum, t) => sum + (t.grossPay ?? t.amount), 0)
          : null;
        return (
          <div className="card" key={workplace.id}>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginBottom: '0.25rem' }}>
                  <span className="swatch" style={{ background: workplace.color }} />
                  {workplace.name}
                  {!workplace.isActive && (
                    <span className="tag" style={{ marginLeft: '0.5rem', fontWeight: 400 }}>
                      退職
                    </span>
                  )}
                </h2>
                <div className="muted">
                  給料日 {dateLabel(cycle.paymentDate)} ・ 対象 {dateLabel(cycle.periodStart)}〜
                  {dateLabel(cycle.periodEnd)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-label">見込み</div>
                <div className="stat-value income">{formatYen(summary.total)}</div>
              </div>
            </div>

            <div className="pay-stats">
              <div>
                <div className="stat-label">出勤</div>
                {summary.days}日
              </div>
              <div>
                <div className="stat-label">勤務</div>
                {durationLabel(summary.workedMinutes)}
              </div>
              <div>
                <div className="stat-label">うち深夜</div>
                {durationLabel(summary.nightMinutes)}
              </div>
              <div>
                <div className="stat-label">うち残業</div>
                {durationLabel(summary.overtimeMinutes)}
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <tbody>
                  <tr>
                    <td>基本給</td>
                    <td className="amount">{formatYen(summary.basePay)}</td>
                  </tr>
                  {workplace.nightPremiumPercent > 0 && (
                    <tr>
                      <td>深夜手当（{workplace.nightPremiumPercent}%）</td>
                      <td className="amount">{formatYen(summary.nightPay)}</td>
                    </tr>
                  )}
                  {workplace.overtimePremiumPercent > 0 && (
                    <tr>
                      <td>残業手当（{workplace.overtimePremiumPercent}%）</td>
                      <td className="amount">{formatYen(summary.overtimePay)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>交通費</td>
                    <td className="amount">{formatYen(summary.transportFee)}</td>
                  </tr>
                  <tr className="total-row">
                    <td>合計（見込み）</td>
                    <td className="amount">{formatYen(summary.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {records.length > 0 ? (
              <div className="subcard">
                <div className="spread">
                  <strong>
                    <span className="tag" style={{ marginRight: '0.5rem' }}>
                      記録済み
                    </span>
                    振込額 {formatYen(recordedAmount)}
                  </strong>
                  <span className="row">
                    {records.map((t) => (
                      <button
                        key={t.id}
                        className="small"
                        onClick={() =>
                          navigate(`/transactions/${t.id}/edit`, {
                            state: { returnTo } satisfies TransactionFormState,
                          })
                        }
                      >
                        {records.length > 1 ? `${dateLabel(t.date)}の記録を編集` : '編集'}
                      </button>
                    ))}
                  </span>
                </div>
                <p className="muted" style={{ margin: '0.5rem 0 0' }}>
                  {recordedGross != null ? (
                    <>
                      総支給額 {formatYen(recordedGross)}（見込みとの差{' '}
                      {formatSignedYen(recordedGross - summary.total)}）・ 控除など{' '}
                      {formatYen(recordedGross - recordedAmount)}
                    </>
                  ) : (
                    <>
                      見込みとの差 {formatSignedYen(recordedAmount - summary.total)}
                      （税金・保険料などが引かれた場合はその分も含みます）
                    </>
                  )}
                </p>
              </div>
            ) : isRecording && form ? (
              <form className="subcard" onSubmit={handleRecord}>
                <h3>給料を記録する</h3>
                <p className="muted">
                  家計簿に収入として記録します。給与明細を見ながら、実際の額に直してください。
                </p>
                <div className="form-grid">
                  <label className="field">
                    入金日
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => updateForm({ date: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    振り込まれた額（手取り・円）
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={form.amount}
                      onChange={(e) => updateForm({ amount: e.target.value })}
                      required
                    />
                  </label>
                  <label className="field">
                    総支給額（明細の額・任意）
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={form.grossPay}
                      onChange={(e) => updateForm({ grossPay: e.target.value })}
                      placeholder="控除前の額"
                    />
                  </label>
                  <label className="field">
                    カテゴリ
                    <select
                      value={form.categoryId}
                      onChange={(e) => updateForm({ categoryId: e.target.value })}
                    >
                      {incomeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    入金先
                    <select
                      value={form.paymentMethodId}
                      onChange={(e) => updateForm({ paymentMethodId: e.target.value })}
                    >
                      {paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    メモ
                    <input
                      value={form.memo}
                      onChange={(e) => updateForm({ memo: e.target.value })}
                      maxLength={1000}
                    />
                  </label>
                </div>
                {error && <p className="expense">{error}</p>}
                <div className="row" style={{ marginTop: '1rem' }}>
                  <button className="primary" type="submit">
                    記録する
                  </button>
                  <button type="button" onClick={() => setRecording(null)}>
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              summary.total > 0 && (
                <div className="row" style={{ marginTop: '0.75rem' }}>
                  <button
                    className={cycle.paymentDate <= today ? 'primary' : ''}
                    onClick={() => openRecord(payroll)}
                  >
                    給料を記録する
                  </button>
                  {cycle.paymentDate > today && (
                    <span className="muted">
                      給料日になったら、振り込まれた額を記録しましょう。
                    </span>
                  )}
                </div>
              )
            )}

            {pays.length > 0 && (
              <details className="pay-details">
                <summary>シフトの内訳（{pays.length}件）</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>時間</th>
                        <th>勤務</th>
                        <th style={{ textAlign: 'right' }}>時給</th>
                        <th style={{ textAlign: 'right' }}>見込み</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pays.map((pay) => (
                        <tr key={pay.shift.id}>
                          <td>
                            <Link
                              to={`/shifts?month=${pay.shift.date.slice(0, 7)}&date=${pay.shift.date}`}
                            >
                              {dateLabel(pay.shift.date)}
                            </Link>
                          </td>
                          <td>{timeRangeLabel(pay.shift)}</td>
                          <td>{durationLabel(pay.workedMinutes)}</td>
                          <td className="amount">{formatYen(pay.wage)}</td>
                          <td className="amount">{formatYen(shiftPayYen(pay))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        );
      })}

      {workplaces.length > 0 && (
        <p className="muted">
          見込みはシフトと時給の設定から計算した概算です（休憩は勤務時間の真ん中に取ったものとして深夜の時間を数えます）。所得税・社会保険料などの控除は含みません。
        </p>
      )}
    </>
  );
}
