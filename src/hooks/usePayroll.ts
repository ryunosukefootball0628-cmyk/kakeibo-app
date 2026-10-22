import { useMemo } from 'react';
import { addMonths, monthRange } from '../utils/date';
import {
  calculateShiftPays,
  groupRatesByWorkplace,
  payrollFor,
} from '../utils/payroll';
import { useLookup, usePayRates, useShiftsBetween, useWorkplaces } from './useData';

/** 給料の計算に使う勤務先と時給の設定 */
export function usePayContext() {
  const workplaces = useWorkplaces();
  const payRates = usePayRates();
  const workplaceById = useLookup(workplaces);
  const ratesByWorkplace = useMemo(() => groupRatesByWorkplace(payRates), [payRates]);
  return { workplaces, payRates, workplaceById, ratesByWorkplace };
}

/** 期間内のシフトと、それぞれの勤務時間・給料 */
export function useShiftPays(start: string, end: string) {
  const context = usePayContext();
  const shifts = useShiftsBetween(start, end);
  const shiftPays = useMemo(
    () => calculateShiftPays(shifts, context.workplaceById, context.ratesByWorkplace),
    [shifts, context.workplaceById, context.ratesByWorkplace],
  );
  return { ...context, shifts, shiftPays };
}

/**
 * 支給月の、勤務先ごとの給料の見込み。
 * 対象期間は翌々月払いだと 3 か月前の月までさかのぼるので、その分のシフトを読む。
 */
export function usePayrolls(paymentYearMonth: string) {
  const { start, end } = useMemo(
    () => ({
      start: monthRange(addMonths(paymentYearMonth, -3)).start,
      end: monthRange(paymentYearMonth).end,
    }),
    [paymentYearMonth],
  );
  const context = useShiftPays(start, end);
  const { workplaces, shiftPays, ratesByWorkplace } = context;
  const payrolls = useMemo(
    () =>
      workplaces.map((workplace) =>
        payrollFor(workplace, paymentYearMonth, shiftPays, ratesByWorkplace),
      ),
    [workplaces, paymentYearMonth, shiftPays, ratesByWorkplace],
  );
  return { ...context, payrolls };
}
