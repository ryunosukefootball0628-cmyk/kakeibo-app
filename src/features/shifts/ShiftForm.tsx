import { useState } from 'react';
import type { Shift, Workplace } from '../../types';
import { durationLabel, TIME_PATTERN, workedMinutesOf } from '../../utils/shift';

/** フォームで入力する値 (id は呼び出し元が決める。まとめて登録するときの date は使わない) */
export type ShiftDraft = Omit<Shift, 'id'>;

interface Props {
  title: string;
  initial: ShiftDraft;
  /** 選べる勤務先 (退職した勤務先は、編集中のシフトのものだけ含める) */
  workplaces: Workplace[];
  /** まとめて登録するときは、日付をカレンダーで選ぶのでここでは聞かない */
  showDate: boolean;
  submitLabel: string;
  onSubmit: (draft: ShiftDraft) => void;
  onCancel: () => void;
}

export default function ShiftForm({
  title,
  initial,
  workplaces,
  showDate,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [workplaceId, setWorkplaceId] = useState(initial.workplaceId);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [breakMinutes, setBreakMinutes] = useState(String(initial.breakMinutes));
  const [memo, setMemo] = useState(initial.memo ?? '');
  const [error, setError] = useState('');

  const breakValue = Number(breakMinutes);
  const validTimes = TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime);
  const worked =
    validTimes && Number.isInteger(breakValue) && breakValue >= 0
      ? workedMinutesOf({ startTime, endTime, breakMinutes: breakValue })
      : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!workplaceId) {
      setError('勤務先を選んでください。');
      return;
    }
    if (showDate && !date) {
      setError('日付を入力してください。');
      return;
    }
    if (!validTimes) {
      setError('開始・終了の時刻を入力してください。');
      return;
    }
    if (!Number.isInteger(breakValue) || breakValue < 0 || !worked) {
      setError('休憩は 0 以上で、勤務時間より短くしてください。');
      return;
    }
    onSubmit({
      workplaceId,
      date,
      startTime,
      endTime,
      breakMinutes: breakValue,
      memo: memo.trim() || undefined,
    });
  };

  return (
    <form className="subcard" onSubmit={handleSubmit}>
      <h3>{title}</h3>
      <div className="form-grid">
        <label className="field">
          勤務先
          <select value={workplaceId} onChange={(e) => setWorkplaceId(e.target.value)}>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {showDate && (
          <label className="field">
            日付
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        )}
        <label className="field">
          開始
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </label>
        <label className="field">
          終了（開始より前なら翌日）
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </label>
        <label className="field">
          休憩（分）
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(e.target.value)}
            required
          />
        </label>
        <label className="field">
          メモ
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="任意"
            maxLength={1000}
          />
        </label>
      </div>

      {worked != null && worked > 0 && (
        <p className="muted" style={{ marginBottom: 0 }}>
          勤務 {durationLabel(worked)}
        </p>
      )}
      {error && <p className="expense">{error}</p>}

      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="primary" type="submit">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
