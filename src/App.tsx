import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './features/dashboard/DashboardPage';
import RecurringPage from './features/recurring/RecurringPage';
import CategoryReportPage from './features/reports/CategoryReportPage';
import PaymentMethodReportPage from './features/reports/PaymentMethodReportPage';
import CategoriesPage from './features/settings/CategoriesPage';
import DataPage from './features/settings/DataPage';
import PaymentMethodsPage from './features/settings/PaymentMethodsPage';
import TransactionFormPage from './features/transactions/TransactionFormPage';
import TransactionsPage from './features/transactions/TransactionsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/new" element={<TransactionFormPage />} />
        <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
        <Route path="/reports/category" element={<CategoryReportPage />} />
        <Route
          path="/reports/payment-methods"
          element={<PaymentMethodReportPage />}
        />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/settings/categories" element={<CategoriesPage />} />
        <Route
          path="/settings/payment-methods"
          element={<PaymentMethodsPage />}
        />
        <Route path="/settings/data" element={<DataPage />} />
        <Route path="*" element={<p>ページが見つかりません。</p>} />
      </Route>
    </Routes>
  );
}
