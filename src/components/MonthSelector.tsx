import { addMonths, currentYearMonth, yearMonthLabel } from '../utils/date';

interface Props {
  value: string;
  onChange: (yearMonth: string) => void;
}

export default function MonthSelector({ value, onChange }: Props) {
  return (
    <div className="row" style={{ marginBottom: '1rem' }}>
      <button onClick={() => onChange(addMonths(value, -1))}>← 前月</button>
      <strong style={{ minWidth: '7rem', textAlign: 'center' }}>
        {yearMonthLabel(value)}
      </strong>
      <button onClick={() => onChange(addMonths(value, 1))}>翌月 →</button>
      {value !== currentYearMonth() && (
        <button className="small" onClick={() => onChange(currentYearMonth())}>
          今月
        </button>
      )}
    </div>
  );
}
