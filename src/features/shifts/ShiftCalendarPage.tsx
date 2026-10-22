import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MonthSelector from '../../components/MonthSelector';
import { addShifts, deleteShift, saveShift } from '../../db/operations';
import { newId } from '../../db/seed';
import { useShiftTemplates } from '../../hooks/useData';
import { useShiftPays } from '../../hooks/usePayroll';
import type { Shift, ShiftTemplate, Workplace } from '../../types';
import {
  dateLabel,
  datesOfMonth,
  monthRange,
  todayIso,
  weekdayOf,
  yearMonthOrCurrent,
} from '../../utils/date';
import { holidayName } from '../../utils/holidays';
import { formatYen } from '../../utils/money';
import { shiftPayYen, summarizePays } from '../../utils/payroll';
import { durationLabel, formatClock, parseTime, timeRangeLabel } from '../../utils/shift';
import ShiftForm, { type ShiftDraft } from './ShiftForm';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 祝日は日曜と同じ色にする */
function dayClass(date: string): string {
  const weekday = weekdayOf(date);
  if (weekday === 0 || holidayName(date)) return 'sun';
  return weekday === 6 ? 'sat' : '';
}

type FormMode =
  | { kind: 'new' }
  | { kind: 'edit'; shift: Shift }
  /** カレンダーで選んだ複数の日に、時間を指定して登録する */
  | { kind: 'bulk' };

const fromTemplate = (template: ShiftTemplate, date: string): Shift => ({
  id: newId(),
  workplaceId: template.workplaceId,
  date,
  startTime: template.startTime,
  endTime: template.endTime,
  breakMinutes: template.breakMinutes,
});

/** カレンダーのマスに入るシフトの帯。狭いときは開始時刻だけにする */
function ShiftChip({ shift, workplace }: { shift: Shift; workplace?: Workplace }) {
  return (
    <span
      className="shift-chip"
      style={{ '--chip-color': workplace?.color ?? 'var(--muted)' } as React.CSSProperties}
    >
      <span className="full">{timeRangeLabel(shift)}</span>
      <span className="short">{formatClock(parseTime(shift.startTime))}</span>
    </span>
  );
}

export default function ShiftCalendarPage() {
  // 給与の画面などから戻ったときに同じ月・同じ日を開けるよう、表示状態は URL に持たせる
  const [searchParams, setSearchParams] = useSearchParams();
  const yearMonth = yearMonthOrCurrent(searchParams.get('month'));
  const dates = useMemo(() => datesOfMonth(yearMonth), [yearMonth]);
  const today = todayIso();
  const dateParam = searchParams.get('date');
  const selected =
    dateParam && dates.includes(dateParam)
      ? dateParam
      : dates.includes(today)
        ? today
        : null;

  const { start, end } = monthRange(yearMonth);
  const { workplaces, workplaceById, ratesByWorkplace, shifts, shiftPays } = useShiftPays(
    start,
    end,
  );
  const templates = useShiftTemplates();

  const [form, setForm] = useState<FormMode | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkDates, setBulkDates] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const activeWorkplaces = useMemo(() => workplaces.filter((w) => w.isActive), [workplaces]);
  const activeTemplates = templates.filter(
    (t) => workplaceById.get(t.workplaceId)?.isActive,
  );

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shifts) {
      map.set(shift.date, [...(map.get(shift.date) ?? []), shift]);
    }
    return map;
  }, [shifts]);

  const monthSummary = useMemo(
    () => summarizePays([...shiftPays.values()], ratesByWorkplace),
    [shiftPays, ratesByWorkplace],
  );

  const dayShifts = selected ? (shiftsByDate.get(selected) ?? []) : [];

  const leadingBlanks = weekdayOf(dates[0]);
  const trailingBlanks = (7 - ((leadingBlanks + dates.length) % 7)) % 7;

  const show = (month: string, date?: string) => {
    // 月や日を切り替えるたびに履歴が積まれると「戻る」で画面を抜けにくいため置き換える
    setSearchParams(date ? { month, date } : { month }, { replace: true });
  };

  const changeMonth = (month: string) => {
    setForm(null);
    setBulkDates([]);
    setMessage('');
    show(month);
  };

  const selectDate = (date: string) => {
    if (bulk) {
      setMessage('');
      setBulkDates((current) =>
        current.includes(date)
          ? current.filter((d) => d !== date)
          : [...current, date].sort(),
      );
      return;
    }
    // 開いているフォームは前に選んでいた日のものなので閉じる
    setForm(null);
    show(yearMonth, date);
  };

  const toggleBulk = () => {
    setForm(null);
    setBulkDates([]);
    setMessage('');
    setBulk(!bulk);
  };

  const registerBulk = (makeShift: (date: string) => Shift, label: string) => {
    addShifts(bulkDates.map(makeShift));
    setMessage(`${bulkDates.length}日に${label}を登録しました。`);
    setBulkDates([]);
    setForm(null);
  };

  const handleSubmit = (draft: ShiftDraft) => {
    if (form?.kind === 'edit') {
      saveShift({ ...draft, id: form.shift.id });
    } else if (form?.kind === 'bulk') {
      registerBulk(
        (date) => ({ ...draft, id: newId(), date }),
        `${timeRangeLabel(draft)}のシフト`,
      );
      return;
    } else {
      saveShift({ ...draft, id: newId() });
    }
    setForm(null);
  };

  const handleDelete = (shift: Shift) => {
    if (!window.confirm(`${dateLabel(shift.date)} ${timeRangeLabel(shift)} のシフトを削除しますか?`)) {
      return;
    }
    deleteShift(shift.id);
    if (form?.kind === 'edit' && form.shift.id === shift.id) setForm(null);
  };

  /** 入力先に出す勤務先。退職した勤務先は、編集中のシフトのものだけ残す */
  const selectableWorkplaces = (shift?: Shift) =>
    workplaces.filter((w) => w.isActive || w.id === shift?.workplaceId);

  const renderForm = () => {
    if (!form) return null;
    if (form.kind === 'edit') {
      return (
        <ShiftForm
          key={form.shift.id}
          title="シフトを編集"
          initial={form.shift}
          workplaces={selectableWorkplaces(form.shift)}
          showDate
          submitLabel="更新する"
          onSubmit={handleSubmit}
          onCancel={() => setForm(null)}
        />
      );
    }
    const initial: ShiftDraft = {
      workplaceId: activeWorkplaces[0]?.id ?? '',
      date: selected ?? today,
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
    };
    return (
      <ShiftForm
        key={form.kind}
        title={form.kind === 'bulk' ? `選んだ${bulkDates.length}日に登録` : 'シフトを追加'}
        initial={initial}
        workplaces={selectableWorkplaces()}
        showDate={form.kind === 'new'}
        submitLabel="登録する"
        onSubmit={handleSubmit}
        onCancel={() => setForm(null)}
      />
    );
  };

  const templateButtons = (onPick: (template: ShiftTemplate) => void, disabled = false) =>
    activeTemplates.length > 0 && (
      <div className="template-chips">
        {activeTemplates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="small template-chip"
            style={
              {
                '--chip-color': workplaceById.get(template.workplaceId)?.color,
              } as React.CSSProperties
            }
            onClick={() => onPick(template)}
            disabled={disabled}
          >
            ＋ {template.name}
            <span className="muted"> {timeRangeLabel(template)}</span>
          </button>
        ))}
      </div>
    );

  if (workplaces.length === 0) {
    return (
      <>
        <h1>シフト</h1>
        <div className="card">
          <p>シフトを登録するには、まず勤務先（アルバイト先など）と時給を登録してください。</p>
          <Link to="/settings/workplaces">
            <button className="primary">勤務先を登録する</button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>シフト</h1>
        <button onClick={toggleBulk} aria-pressed={bulk}>
          {bulk ? 'まとめて登録をやめる' : 'まとめて登録'}
        </button>
      </div>
      <MonthSelector value={yearMonth} onChange={changeMonth} />

      <div className="card calendar-card">
        <div className="spread" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span className="muted">この月の勤務</span>
          <span className="row">
            <span>{monthSummary.days}日</span>
            <span>{durationLabel(monthSummary.workedMinutes)}</span>
            <span className="income">見込み {formatYen(monthSummary.total)}</span>
          </span>
        </div>

        <div className="calendar">
          {WEEKDAYS.map((label, i) => (
            <div
              key={label}
              className={`calendar-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}
            >
              {label}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {dates.map((date) => {
            const cellShifts = shiftsByDate.get(date) ?? [];
            const holiday = holidayName(date);
            const label = [
              dateLabel(date),
              holiday,
              ...cellShifts.map(
                (s) => `${workplaceById.get(s.workplaceId)?.name ?? ''} ${timeRangeLabel(s)}`,
              ),
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={date}
                type="button"
                className={`calendar-cell${date === today ? ' today' : ''}`}
                aria-pressed={bulk ? bulkDates.includes(date) : date === selected}
                aria-label={label}
                title={holiday}
                onClick={() => selectDate(date)}
              >
                <span className={`calendar-day ${dayClass(date)}`}>{Number(date.slice(8))}</span>
                {cellShifts.map((shift) => (
                  <ShiftChip
                    key={shift.id}
                    shift={shift}
                    workplace={workplaceById.get(shift.workplaceId)}
                  />
                ))}
              </button>
            );
          })}
          {Array.from({ length: trailingBlanks }, (_, i) => (
            <div key={`trail-${i}`} />
          ))}
        </div>
      </div>

      {bulk ? (
        <div className="card">
          <h2>まとめて登録</h2>
          <p className="muted">
            カレンダーで日付をいくつか選んでから、テンプレートか時間を指定して登録します。
          </p>
          <p>
            {bulkDates.length === 0
              ? '日付が選ばれていません。'
              : `${bulkDates.length}日を選択中：${bulkDates.map(dateLabel).join('、')}`}
          </p>
          {templateButtons(
            (template) => registerBulk((date) => fromTemplate(template, date), `「${template.name}」`),
            bulkDates.length === 0,
          )}
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button
              className="small"
              onClick={() => setForm({ kind: 'bulk' })}
              disabled={bulkDates.length === 0}
            >
              時間を指定して登録
            </button>
            <button
              className="small"
              onClick={() => setBulkDates([])}
              disabled={bulkDates.length === 0}
            >
              選択を解除
            </button>
          </div>
          {message && (
            <p className="income" style={{ marginBottom: 0 }}>
              {message}
            </p>
          )}
          {form?.kind === 'bulk' && bulkDates.length > 0 && renderForm()}
        </div>
      ) : (
        <div className="card">
          {selected === null ? (
            <p className="empty">日付を選ぶと、その日のシフトを表示します。</p>
          ) : (
            <>
              <div className="spread" style={{ marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0 }}>
                  {dateLabel(selected)}のシフト
                  {holidayName(selected) && (
                    <span className="tag" style={{ marginLeft: '0.5rem', fontWeight: 400 }}>
                      {holidayName(selected)}
                    </span>
                  )}
                </h2>
                <button className="small primary" onClick={() => setForm({ kind: 'new' })}>
                  ＋ 時間を指定して追加
                </button>
              </div>

              {templateButtons((template) => saveShift(fromTemplate(template, selected)))}

              {form && renderForm()}

              {dayShifts.length === 0 ? (
                <p className="empty">この日のシフトはありません。</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {dayShifts.map((shift) => {
                        const workplace = workplaceById.get(shift.workplaceId);
                        const pay = shiftPays.get(shift.id);
                        return (
                          <tr key={shift.id}>
                            <td>
                              <span
                                className="swatch"
                                style={{ background: workplace?.color ?? 'var(--muted)' }}
                              />
                              {workplace?.name ?? '(削除済み)'}
                            </td>
                            <td>{timeRangeLabel(shift)}</td>
                            <td className="muted">
                              休憩 {shift.breakMinutes > 0 ? durationLabel(shift.breakMinutes) : 'なし'}
                            </td>
                            <td>{pay && durationLabel(pay.workedMinutes)}</td>
                            <td className="amount">{pay && formatYen(shiftPayYen(pay))}</td>
                            <td className="memo">{shift.memo}</td>
                            <td>
                              <span className="row" style={{ flexWrap: 'nowrap' }}>
                                <button
                                  className="small"
                                  onClick={() => setForm({ kind: 'edit', shift })}
                                >
                                  編集
                                </button>
                                <button
                                  className="small danger"
                                  onClick={() => handleDelete(shift)}
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
              )}
              {dayShifts.length > 0 && (
                <p className="muted" style={{ marginBottom: 0 }}>
                  金額は交通費を除いた見込みです。
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
