import { useMemo } from 'react';
import { ledgerDataRange } from '../utils/balance';
import { withMovedCardTransactions } from '../utils/billing';
import { toYearMonth } from '../utils/date';
import {
  useMovedCardTransactionsResult,
  usePaymentMethodsResult,
  useTransactionsResult,
} from './useData';

/**
 * 支払い方法と、銀行口座の残高を until まで求めるのに必要な取引。
 * 取引は残高を合わせた日の翌日 (カードの請求の対象期間はそれより前) から読み、from を渡すとその日からは必ず読む。
 * 明細に合わせてほかの月の請求へ移したカードの利用は、利用日がその期間の外のことがあるので、
 * 移した先の支払月がその期間の月のものも読む。
 * 残高を入力した口座が無ければ取引は読まない。enabled が false (口座残高を使わない設定) なら、
 * 取引を読まず、口座も返さない。
 * loading のあいだは、読み込む前の空の結果などで誤った残高が出るので表示しない
 */
export function useAccountData(
  until: string,
  { from, enabled = true }: { from?: string; enabled?: boolean } = {},
) {
  const methods = usePaymentMethodsResult();
  const range = useMemo(
    () => (enabled ? ledgerDataRange(methods.items, until, from) : null),
    [enabled, methods.items, until, from],
  );
  const byDate = useTransactionsResult(range);
  const moved = useMovedCardTransactionsResult(
    range && { from: toYearMonth(range.start), to: toYearMonth(range.end) },
  );
  const transactions = useMemo(
    () => withMovedCardTransactions(byDate.items, moved.items),
    [byDate.items, moved.items],
  );
  const accounts = useMemo(
    () => (enabled ? methods.items.filter((m) => m.kind === 'bank') : []),
    [enabled, methods.items],
  );
  return {
    methods: methods.items,
    accounts,
    transactions,
    loading: methods.loading || byDate.loading || moved.loading,
  };
}
