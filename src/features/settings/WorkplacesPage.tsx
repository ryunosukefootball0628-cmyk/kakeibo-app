import { useMemo, useState } from 'react';
import {
  addWorkplace,
  countShiftsOf,
  deletePayRate,
  deleteShiftTemplate,
  deleteWorkplace,
  replacePayRates,
  savePayRate,
  saveShiftTemplate,
  saveWorkplace,
  setWorkplaceActive,
} from '../../db/operations';
import { newId } from '../../db/seed';
import { describeError } from '../../db/syncStatus';
import { useShiftTemplates } from '../../hooks/useData';
import { usePayContext } from '../../hooks/usePayroll';
import type { PayRate, ShiftTemplate, Workplace } from '../../types';
import { closingRuleLabel } from '../../utils/billing';
import { todayIso } from '../../utils/date';
import { formatYen } from '../../utils/money';
import { FIRST_RATE_START_DATE, rateOn } from '../../utils/payroll';
import { durationLabel, timeRangeLabel, workedMinutesOf } from '../../utils/shift';

/** 新しい勤務先に順に割り当てる色 */
const COLORS = ['#1d7cd6', '#e8743b', '#19a979', '#945ecf', '#ec8ca4', '#13a4b4'];

const DEFAULT_PREMIUM = '25';

interface WorkplaceForm {
  id: string | null;
  name: string;
  color: string;
  closingDay: string;
  paymentDay: string;
  paymentMonthOffset: string;
  nightPremiumPercent: string;
  overtimePremiumPercent: string;
  hourlyWage: string;
  saturdayWage: string;
  sundayWage: string;
  holidayWage: string;
  transportFee: string;
  /** 時給・交通費を変えたとき、いつのシフトから使うか */
  rateApply: 'from' | 'all';
  rateStartDate: string;
}

interface TemplateForm {
  id: string | null;
  workplaceId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
}

const RATE_FIELDS = [
  'hourlyWage',
  'saturdayWage',
  'sundayWage',
  'holidayWage',
  'transportFee',
] as const;

const optionalText = (value: number | undefined) => (value == null ? '' : String(value));

/** 時給の設定をフォームの値にする */
function rateFields(rate: PayRate | undefined) {
  return {
    hourlyWage: optionalText(rate?.hourlyWage),
    saturdayWage: optionalText(rate?.saturdayWage),
    sundayWage: optionalText(rate?.sundayWage),
    holidayWage: optionalText(rate?.holidayWage),
    transportFee: rate ? String(rate.transportFee) : '0',
  };
}

const isWholeNumberIn = (text: string, min: number, max: number) => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
};

/** 空欄は未設定 (undefined)。数値でなければ null */
function parseOptionalWage(text: string): number | undefined | null {
  if (text.trim() === '') return undefined;
  return isWholeNumberIn(text, 0, 1000000) ? Number(text) : null;
}

function wageSummary(rate: PayRate): string {
  const extras = [
    rate.saturdayWage != null && `土 ${formatYen(rate.saturdayWage)}`,
    rate.sundayWage != null && `日 ${formatYen(rate.sundayWage)}`,
    rate.holidayWage != null && `祝 ${formatYen(rate.holidayWage)}`,
  ].filter(Boolean);
  return extras.length > 0
    ? `${formatYen(rate.hourlyWage)}（${extras.join(' / ')}）`
    : formatYen(rate.hourlyWage);
}

export default function WorkplacesPage() {
  const { workplaces, workplaceById, ratesByWorkplace } = usePayContext();
  const templates = useShiftTemplates();
  const [form, setForm] = useState<WorkplaceForm | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const editingRates = useMemo(
    () => (form?.id ? (ratesByWorkplace.get(form.id) ?? []) : []),
    [form?.id, ratesByWorkplace],
  );
  const latestRate = editingRates[editingRates.length - 1];
  const rateChanged =
    form?.id != null &&
    RATE_FIELDS.some((field) => form[field] !== rateFields(latestRate)[field]);

  const openNew = () => {
    setError('');
    setForm({
      id: null,
      name: '',
      color: COLORS[workplaces.length % COLORS.length],
      closingDay: '31',
      paymentDay: '25',
      paymentMonthOffset: '1',
      nightPremiumPercent: DEFAULT_PREMIUM,
      overtimePremiumPercent: DEFAULT_PREMIUM,
      ...rateFields(undefined),
      rateApply: 'from',
      rateStartDate: today,
    });
  };

  const openEdit = (workplace: Workplace) => {
    setError('');
    const rates = ratesByWorkplace.get(workplace.id) ?? [];
    setForm({
      id: workplace.id,
      name: workplace.name,
      color: workplace.color,
      closingDay: String(workplace.closingDay),
      paymentDay: String(workplace.paymentDay),
      paymentMonthOffset: String(workplace.paymentMonthOffset),
      nightPremiumPercent: String(workplace.nightPremiumPercent),
      overtimePremiumPercent: String(workplace.overtimePremiumPercent),
      ...rateFields(rates[rates.length - 1]),
      rateApply: 'from',
      rateStartDate: today,
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;

    if (!form.name.trim()) {
      setError('勤務先の名前を入力してください。');
      return;
    }
    if (!isWholeNumberIn(form.closingDay, 1, 31) || !isWholeNumberIn(form.paymentDay, 1, 31)) {
      setError('締め日・給料日は 1〜31 で入力してください。');
      return;
    }
    if (
      !isWholeNumberIn(form.nightPremiumPercent, 0, 100) ||
      !isWholeNumberIn(form.overtimePremiumPercent, 0, 100)
    ) {
      setError('割増率は 0〜100 の整数で入力してください。');
      return;
    }
    const saturdayWage = parseOptionalWage(form.saturdayWage);
    const sundayWage = parseOptionalWage(form.sundayWage);
    const holidayWage = parseOptionalWage(form.holidayWage);
    if (
      !isWholeNumberIn(form.hourlyWage, 1, 1000000) ||
      saturdayWage === null ||
      sundayWage === null ||
      holidayWage === null
    ) {
      setError('時給は 1 以上の整数で入力してください（土日祝の時給は空欄にもできます）。');
      return;
    }
    if (!isWholeNumberIn(form.transportFee, 0, 1000000)) {
      setError('交通費は 0 以上の整数で入力してください。');
      return;
    }
    if (rateChanged && form.rateApply === 'from' && !form.rateStartDate) {
      setError('新しい時給を使い始める日を入力してください。');
      return;
    }

    const existing = form.id ? workplaceById.get(form.id) : undefined;
    const workplace: Workplace = {
      id: form.id ?? newId(),
      name: form.name.trim(),
      color: form.color,
      closingDay: Number(form.closingDay),
      paymentDay: Number(form.paymentDay),
      paymentMonthOffset: Number(form.paymentMonthOffset),
      nightPremiumPercent: Number(form.nightPremiumPercent),
      overtimePremiumPercent: Number(form.overtimePremiumPercent),
      isActive: existing?.isActive ?? true,
      sortOrder:
        existing?.sortOrder ?? Math.max(0, ...workplaces.map((w) => w.sortOrder)) + 1,
    };
    const rateValues = {
      workplaceId: workplace.id,
      hourlyWage: Number(form.hourlyWage),
      saturdayWage,
      sundayWage,
      holidayWage,
      transportFee: Number(form.transportFee),
    };

    if (!form.id) {
      addWorkplace(workplace, { ...rateValues, id: newId(), startDate: FIRST_RATE_START_DATE });
    } else {
      saveWorkplace(workplace);
      if (!latestRate) {
        savePayRate({ ...rateValues, id: newId(), startDate: FIRST_RATE_START_DATE });
      } else if (rateChanged && form.rateApply === 'all') {
        replacePayRates(editingRates, {
          ...rateValues,
          id: latestRate.id,
          startDate: editingRates[0].startDate,
        });
      } else if (rateChanged) {
        // 同じ日に始まる設定があれば上書きし、無ければ履歴に加える
        const sameDay = editingRates.find((r) => r.startDate === form.rateStartDate);
        savePayRate({
          ...rateValues,
          id: sameDay?.id ?? newId(),
          startDate: form.rateStartDate,
        });
      }
    }
    setForm(null);
  };

  const handleDeleteRate = (rate: PayRate) => {
    if (!window.confirm(`${rate.startDate} からの時給の設定を削除しますか?`)) return;
    deletePayRate(rate.id);
  };

  const handleDelete = async (workplace: Workplace) => {
    setError('');
    setBusy(true);
    try {
      const shiftCount = await countShiftsOf(workplace.id);
      const message =
        shiftCount > 0
          ? `「${workplace.name}」と、そのシフト${shiftCount}件・テンプレート・時給の設定を削除します。記録済みの給料（取引）は残ります。辞めた勤務先の記録を残したい場合は「退職」にしてください。削除しますか?`
          : `「${workplace.name}」を削除しますか?`;
      if (!window.confirm(message)) return;
      await deleteWorkplace(workplace.id);
      if (form?.id === workplace.id) setForm(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  // ---------- テンプレート ----------

  const activeWorkplaces = workplaces.filter((w) => w.isActive);

  const openNewTemplate = () => {
    setError('');
    setTemplateForm({
      id: null,
      workplaceId: activeWorkplaces[0]?.id ?? '',
      name: '',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: '60',
    });
  };

  const openEditTemplate = (template: ShiftTemplate) => {
    setError('');
    setTemplateForm({
      id: template.id,
      workplaceId: template.workplaceId,
      name: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
      breakMinutes: String(template.breakMinutes),
    });
  };

  const handleTemplateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateForm) return;
    if (!templateForm.workplaceId || !templateForm.name.trim()) {
      setError('勤務先とテンプレートの名前を入力してください。');
      return;
    }
    if (!templateForm.startTime || !templateForm.endTime) {
      setError('開始・終了の時刻を入力してください。');
      return;
    }
    const draft = {
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
      breakMinutes: Number(templateForm.breakMinutes),
    };
    if (
      !isWholeNumberIn(templateForm.breakMinutes, 0, 1439) ||
      workedMinutesOf(draft) === 0
    ) {
      setError('休憩は 0 以上で、勤務時間より短くしてください。');
      return;
    }
    saveShiftTemplate({
      id: templateForm.id ?? newId(),
      workplaceId: templateForm.workplaceId,
      name: templateForm.name.trim(),
      ...draft,
    });
    setTemplateForm(null);
  };

  const handleDeleteTemplate = (template: ShiftTemplate) => {
    if (!window.confirm(`テンプレート「${template.name}」を削除しますか?`)) return;
    deleteShiftTemplate(template.id);
  };

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>勤務先設定</h1>
        <button className="primary" onClick={openNew}>
          ＋ 勤務先を追加
        </button>
      </div>

      {error && (
        <div className="card">
          <span className="expense">{error}</span>
        </div>
      )}

      {form && (
        <form className="card" onSubmit={handleSubmit}>
          <h2>{form.id ? '勤務先を編集' : '勤務先を追加'}</h2>
          <div className="form-grid">
            <label className="field">
              名前
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="〇〇カフェ"
                maxLength={100}
                required
              />
            </label>
            <label className="field">
              色（カレンダーでの表示）
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </label>
            <label className="field">
              締め日（31 を指定すると月末）
              <input
                type="number"
                min={1}
                max={31}
                value={form.closingDay}
                onChange={(e) => setForm({ ...form, closingDay: e.target.value })}
                required
              />
            </label>
            <label className="field">
              給料日（31 を指定すると月末）
              <input
                type="number"
                min={1}
                max={31}
                value={form.paymentDay}
                onChange={(e) => setForm({ ...form, paymentDay: e.target.value })}
                required
              />
            </label>
            <label className="field">
              給料が出る月
              <select
                value={form.paymentMonthOffset}
                onChange={(e) => setForm({ ...form, paymentMonthOffset: e.target.value })}
              >
                <option value="0">締め月と同じ月（当月払い）</option>
                <option value="1">締め月の翌月</option>
                <option value="2">締め月の翌々月</option>
              </select>
            </label>
          </div>

          <h3 style={{ marginTop: '1.25rem' }}>時給・交通費</h3>
          <div className="form-grid">
            <label className="field">
              時給 (円)
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.hourlyWage}
                onChange={(e) => setForm({ ...form, hourlyWage: e.target.value })}
                placeholder="1100"
                required
              />
            </label>
            <label className="field">
              土曜の時給（空欄なら同じ）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.saturdayWage}
                onChange={(e) => setForm({ ...form, saturdayWage: e.target.value })}
              />
            </label>
            <label className="field">
              日曜の時給（空欄なら同じ）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.sundayWage}
                onChange={(e) => setForm({ ...form, sundayWage: e.target.value })}
              />
            </label>
            <label className="field">
              祝日の時給（空欄なら曜日の時給）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.holidayWage}
                onChange={(e) => setForm({ ...form, holidayWage: e.target.value })}
              />
            </label>
            <label className="field">
              交通費（出勤 1 日あたり・円）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.transportFee}
                onChange={(e) => setForm({ ...form, transportFee: e.target.value })}
                required
              />
            </label>
          </div>

          {rateChanged && (
            <fieldset className="choice-group">
              <legend>変更した時給・交通費を、どのシフトから使いますか？</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="rateApply"
                  checked={form.rateApply === 'from'}
                  onChange={() => setForm({ ...form, rateApply: 'from' })}
                />
                <span>
                  この日以降のシフトから
                  <input
                    type="date"
                    value={form.rateStartDate}
                    onChange={(e) =>
                      setForm({ ...form, rateApply: 'from', rateStartDate: e.target.value })
                    }
                    style={{ width: 'auto', marginLeft: '0.5rem' }}
                  />
                  <span className="muted" style={{ display: 'block' }}>
                    昇給や最低賃金の改定のとき。それより前のシフトは今までの額で計算します。
                  </span>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="rateApply"
                  checked={form.rateApply === 'all'}
                  onChange={() => setForm({ ...form, rateApply: 'all' })}
                />
                <span>
                  これまでのシフトすべて
                  <span className="muted" style={{ display: 'block' }}>
                    入力の間違いを直すとき。時給の履歴はこの額 1 つになります。
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {form.id && editingRates.length > 1 && (
            <div style={{ marginTop: '1rem' }}>
              <h3>時給の履歴</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>適用開始</th>
                      <th>時給</th>
                      <th style={{ textAlign: 'right' }}>交通費</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingRates.map((rate, index) => (
                      <tr key={rate.id}>
                        <td>{index === 0 ? '最初から' : rate.startDate}</td>
                        <td>{wageSummary(rate)}</td>
                        <td className="amount">{formatYen(rate.transportFee)}</td>
                        <td>
                          <button
                            type="button"
                            className="small danger"
                            onClick={() => handleDeleteRate(rate)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h3 style={{ marginTop: '1.25rem' }}>割増</h3>
          <div className="form-grid">
            <label className="field">
              深夜手当（22時〜翌5時・%）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={form.nightPremiumPercent}
                onChange={(e) => setForm({ ...form, nightPremiumPercent: e.target.value })}
                required
              />
            </label>
            <label className="field">
              残業手当（1日8時間を超えた分・%）
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={form.overtimePremiumPercent}
                onChange={(e) => setForm({ ...form, overtimePremiumPercent: e.target.value })}
                required
              />
            </label>
          </div>
          <p className="muted">
            法律で決まった割増は、深夜・残業とも 25% 以上です。時給に含まれているなど割増しない場合は 0 にします。
          </p>

          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="primary" type="submit">
              保存する
            </button>
            <button type="button" onClick={() => setForm(null)}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {workplaces.length === 0 ? (
          <p className="empty">
            勤務先がまだありません。「＋ 勤務先を追加」から、アルバイト先などを登録してください。
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>勤務先</th>
                  <th>いまの時給</th>
                  <th>締め日 / 給料日</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {workplaces.map((workplace) => {
                  const rate = rateOn(ratesByWorkplace.get(workplace.id) ?? [], today);
                  return (
                    <tr key={workplace.id} style={{ opacity: workplace.isActive ? 1 : 0.55 }}>
                      <td>
                        <span className="swatch" style={{ background: workplace.color }} />
                        {workplace.name}
                      </td>
                      <td>{rate ? wageSummary(rate) : '—'}</td>
                      <td className="muted">{closingRuleLabel(workplace)}</td>
                      <td>
                        <span className="tag">{workplace.isActive ? '勤務中' : '退職'}</span>
                      </td>
                      <td>
                        <span className="row">
                          <button className="small" onClick={() => openEdit(workplace)}>
                            編集
                          </button>
                          <button
                            className="small"
                            onClick={() => setWorkplaceActive(workplace.id, !workplace.isActive)}
                          >
                            {workplace.isActive ? '退職' : '再開'}
                          </button>
                          <button
                            className="small danger"
                            onClick={() => handleDelete(workplace)}
                            disabled={busy}
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
        {workplaces.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            「退職」にすると、シフトの入力先に出なくなります。これまでのシフトと給料の記録は残ります。
          </p>
        )}
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>シフトのテンプレート</h2>
          <button
            className="small primary"
            onClick={openNewTemplate}
            disabled={activeWorkplaces.length === 0}
          >
            ＋ 追加
          </button>
        </div>
        <p className="muted">
          よく入る時間帯を登録しておくと、シフトの画面からワンタップで追加できます。
        </p>

        {templateForm && (
          <form onSubmit={handleTemplateSubmit} style={{ marginBottom: '1rem' }}>
            <div className="form-grid">
              <label className="field">
                勤務先
                <select
                  value={templateForm.workplaceId}
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, workplaceId: e.target.value })
                  }
                >
                  {workplaces
                    .filter((w) => w.isActive || w.id === templateForm.workplaceId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                名前
                <input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="早番"
                  maxLength={50}
                  required
                />
              </label>
              <label className="field">
                開始
                <input
                  type="time"
                  value={templateForm.startTime}
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, startTime: e.target.value })
                  }
                  required
                />
              </label>
              <label className="field">
                終了（開始より前なら翌日）
                <input
                  type="time"
                  value={templateForm.endTime}
                  onChange={(e) => setTemplateForm({ ...templateForm, endTime: e.target.value })}
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
                  value={templateForm.breakMinutes}
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, breakMinutes: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: '1rem' }}>
              <button className="primary" type="submit">
                保存する
              </button>
              <button type="button" onClick={() => setTemplateForm(null)}>
                キャンセル
              </button>
            </div>
          </form>
        )}

        {templates.length === 0 ? (
          <p className="empty">
            {workplaces.length === 0
              ? '先に勤務先を登録してください。'
              : 'テンプレートはまだありません。'}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>勤務先</th>
                  <th>名前</th>
                  <th>時間</th>
                  <th>休憩</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const workplace = workplaceById.get(template.workplaceId);
                  return (
                    <tr key={template.id}>
                      <td>
                        <span
                          className="swatch"
                          style={{ background: workplace?.color ?? 'var(--muted)' }}
                        />
                        {workplace?.name ?? '(削除済み)'}
                      </td>
                      <td>{template.name}</td>
                      <td>{timeRangeLabel(template)}</td>
                      <td className="muted">
                        {template.breakMinutes > 0 ? durationLabel(template.breakMinutes) : 'なし'}
                      </td>
                      <td>
                        <span className="row">
                          <button className="small" onClick={() => openEditTemplate(template)}>
                            編集
                          </button>
                          <button
                            className="small danger"
                            onClick={() => handleDeleteTemplate(template)}
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
      </div>
    </>
  );
}
