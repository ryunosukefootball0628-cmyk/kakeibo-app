import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MonthSelector from '../../components/MonthSelector';
import {
  useCategories,
  useLookup,
  usePaymentMethods,
  useTransactionsInMonth,
} from '../../hooks/useData';
import type { TransactionType } from '../../types';
import { currentYearMonth } from '../../utils/date';
import { formatYen } from '../../utils/money';
import TransactionTable from './TransactionTable';

export default function TransactionsPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [keyword, setKeyword] = useState('');

  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const categoryById = useLookup(categories);
  const methodById = useLookup(paymentMethods);
  const transactions = useTransactionsInMonth(yearMonth);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.categoryId !== categoryFilter) return false;
      if (methodFilter !== 'all' && t.paymentMethodId !== methodFilter) return false;
      if (kw && !(t.memo ?? '').toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, methodFilter, keyword]);

  const income = filtered
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = filtered
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <>
      <div className="spread" style={{ marginBottom: '0.5rem' }}>
        <h1>取引一覧</h1>
        <Link to="/transactions/new">
          <button className="primary">＋ 記録する</button>
        </Link>
      </div>

      <MonthSelector value={yearMonth} onChange={setYearMonth} />

      <div className="card">
        <div className="form-grid">
          <label className="field">
            種別
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as TransactionType | 'all')
              }
            >
              <option value="all">すべて</option>
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </label>
          <label className="field">
            カテゴリ
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">すべて</option>
              <optgroup label="支出">
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="収入">
                {categories
                  .filter((c) => c.type === 'income')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label className="field">
            支払い方法
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="all">すべて</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            メモ検索
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="キーワード"
            />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: '0.75rem' }}>
          <span className="muted">{filtered.length}件</span>
          <span className="row">
            <span className="income">収入 {formatYen(income)}</span>
            <span className="expense">支出 {formatYen(expense)}</span>
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="empty">該当する取引がありません。</p>
        ) : (
          <TransactionTable
            transactions={filtered}
            categoryById={categoryById}
            methodById={methodById}
          />
        )}
      </div>
    </>
  );
}
