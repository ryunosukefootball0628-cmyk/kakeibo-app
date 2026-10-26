import { useMemo } from 'react';
import { addMonths, monthRange, yearMonthsBetween } from '../utils/date';
import {
  calculateShiftPays,
  groupRatesByWorkplace,
  payrollFor,
} from '../utils/payroll';
import { useLookup, usePayRates, useShiftsBetween, useWorkplaces } from './useData';

// enabled が false (シフト・給与を使わない設定) なら読まず、空の結果を返す

/** 給料の計算に使う勤務先と時給の設定 */
export function usePayContext(enabled = true) {
  const workplaces = useWorkplaces(enabled);
  const payRates = usePayRates(enabled);
  const workplaceById = useLookup(workplaces);
  const ratesByWorkplace = useMemo(() => groupRatesByWorkplace(payRates), [payRates]);
  return { workplaces, payRates, workplaceById, ratesByWorkplace };
}

/** 期間内のシフトと、それぞれの勤務時間・給料 */
export function useShiftPays(start: string, end: string, enabled = true) {
  const context = usePayContext(enabled);
  const shifts = useShiftsBetween(start, end, enabled);
  const shiftPays = useMemo(
    () => calculateShiftPays(shifts, context.workplaceById, context.ratesByWorkplace),
    [shifts, context.workplaceById, context.ratesByWorkplace],
  );
  return { ...context, shifts, shiftPays };
}

/** 支給月の、勤務先ごとの給料の見込み */
export function usePayrolls(paymentYearMonth: string, enabled = true) {
  return usePayrollsBetween(paymentYearMonth, paymentYearMonth, enabled);
}

/**
 * 支給月 fromMonth〜toMonth の、勤務先ごとの給料の見込み (支給月の古い順、同じ月は勤務先の順)。
 * 対象期間は翌々月払いだと 3 か月前の月までさかのぼるので、その分のシフトを読む。
 */
export function usePayrollsBetween(fromMonth: string, toMonth: string, enabled = true) {
  const { start, end } = useMemo(
    () => ({
      start: monthRange(addMonths(fromMonth, -3)).start,
      end: monthRange(toMonth).end,
    }),
    [fromMonth, toMonth],
  );
  const context = useShiftPays(start, end, enabled);
  const { workplaces, shiftPays, ratesByWorkplace } = context;
  const payrolls = useMemo(
    () =>
      yearMonthsBetween(fromMonth, toMonth).flatMap((month) =>
        workplaces.map((workplace) =>
          payrollFor(workplace, month, shiftPays, ratesByWorkplace),
        ),
      ),
    [workplaces, fromMonth, toMonth, shiftPays, ratesByWorkplace],
  );
  return { ...context, payrolls };
}
