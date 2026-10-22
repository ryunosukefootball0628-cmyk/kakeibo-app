import { useMemo } from 'react';
import { ledgerDataRange } from '../utils/balance';
import { usePaymentMethodsResult, useTransactionsResult } from './useData';

/**
 * 支払い方法と、銀行口座の残高を until まで求めるのに必要な取引。
 * 取引は残高を合わせた日の翌日 (カードの請求の対象期間はそれより前) から読み、from を渡すとその日からは必ず読む。
 * 残高を入力した口座が無ければ取引は読まない。
 * loading のあいだは、読み込む前の空の結果などで誤った残高が出るので表示しない
 */
export function useAccountData(until: string, from?: string) {
  const methods = usePaymentMethodsResult();
  const range = useMemo(
    () => ledgerDataRange(methods.items, until, from),
    [methods.items, until, from],
  );
  const transactions = useTransactionsResult(range);
  const accounts = useMemo(
    () => methods.items.filter((m) => m.kind === 'bank'),
    [methods.items],
  );
  return {
    methods: methods.items,
    accounts,
    transactions: transactions.items,
    loading: methods.loading || transactions.loading,
  };
}
