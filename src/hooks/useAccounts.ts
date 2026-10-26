import { useMemo } from 'react';
import { ledgerDataRange } from '../utils/balance';
import { usePaymentMethodsResult, useTransactionsResult } from './useData';

/**
 * 支払い方法と、銀行口座の残高を until まで求めるのに必要な取引。
 * 取引は残高を合わせた日の翌日 (カードの請求の対象期間はそれより前) から読み、from を渡すとその日からは必ず読む。
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
  const transactions = useTransactionsResult(range);
  const accounts = useMemo(
    () => (enabled ? methods.items.filter((m) => m.kind === 'bank') : []),
    [enabled, methods.items],
  );
  return {
    methods: methods.items,
    accounts,
    transactions: transactions.items,
    loading: methods.loading || transactions.loading,
  };
}
