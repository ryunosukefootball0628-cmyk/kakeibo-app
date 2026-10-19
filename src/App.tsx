import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { UserProvider, useAuthState } from './auth/session';
import Layout from './components/Layout';
import { initializeUserData } from './db/operations';
import { reportSyncError } from './db/syncStatus';
import LoginPage from './features/auth/LoginPage';
import SetupRequiredPage from './features/auth/SetupRequiredPage';
import DashboardPage from './features/dashboard/DashboardPage';
import RecurringPage from './features/recurring/RecurringPage';
import CalendarReportPage from './features/reports/CalendarReportPage';
import CategoryReportPage from './features/reports/CategoryReportPage';
import PaymentMethodReportPage from './features/reports/PaymentMethodReportPage';
import CategoriesPage from './features/settings/CategoriesPage';
import DataPage from './features/settings/DataPage';
import PaymentMethodsPage from './features/settings/PaymentMethodsPage';
import TransactionFormPage from './features/transactions/TransactionFormPage';
import TransactionsPage from './features/transactions/TransactionsPage';
import { isFirebaseConfigured } from './firebase';

export default function App() {
  if (!isFirebaseConfigured) return <SetupRequiredPage />;
  return <AuthGate />;
}

function AuthGate() {
  const user = useAuthState();
  const uid = user?.uid;

  // 初回ログイン時の初期データ作成は裏で進める (届いた時点で各画面に反映される)
  useEffect(() => {
    if (uid) initializeUserData(uid).catch(reportSyncError);
  }, [uid]);

  if (user === undefined) return <p className="loading">読み込み中…</p>;
  if (user === null) return <LoginPage />;

  return (
    <UserProvider value={user}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/new" element={<TransactionFormPage />} />
          <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
          <Route path="/reports/calendar" element={<CalendarReportPage />} />
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
    </UserProvider>
  );
}
