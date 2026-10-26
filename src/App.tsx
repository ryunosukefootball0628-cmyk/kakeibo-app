import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { completeRedirect, UserProvider, useAuthState } from './auth/session';
import FeatureGate from './components/FeatureGate';
import Layout from './components/Layout';
import { initializeUserData } from './db/operations';
import { isCancelledPopup, reportSyncError } from './db/syncStatus';
import LoginPage from './features/auth/LoginPage';
import SetupRequiredPage from './features/auth/SetupRequiredPage';
import AccountsPage from './features/accounts/AccountsPage';
import DashboardPage from './features/dashboard/DashboardPage';
import RecurringPage from './features/recurring/RecurringPage';
import CalendarReportPage from './features/reports/CalendarReportPage';
import CategoryReportPage from './features/reports/CategoryReportPage';
import PaymentMethodReportPage from './features/reports/PaymentMethodReportPage';
import SalaryPage from './features/salary/SalaryPage';
import CategoriesPage from './features/settings/CategoriesPage';
import DataPage from './features/settings/DataPage';
import FeaturesPage from './features/settings/FeaturesPage';
import PaymentMethodsPage from './features/settings/PaymentMethodsPage';
import WorkplacesPage from './features/settings/WorkplacesPage';
import ShiftCalendarPage from './features/shifts/ShiftCalendarPage';
import TransactionFormPage from './features/transactions/TransactionFormPage';
import TransactionsPage from './features/transactions/TransactionsPage';
import { isFirebaseConfigured } from './firebase';
import { FeaturesProvider, useFeatureSettings } from './hooks/useFeatures';

export default function App() {
  if (!isFirebaseConfigured) return <SetupRequiredPage />;
  return <AuthGate />;
}

function AuthGate() {
  const user = useAuthState();
  const uid = user?.uid;
  const features = useFeatureSettings(uid);

  // Google の画面から戻ってきたときのログイン・本人確認の失敗を表示できるようにする
  useEffect(() => {
    completeRedirect().catch((e) => {
      if (!isCancelledPopup(e)) reportSyncError(e);
    });
  }, []);

  // 初回ログイン時の初期データ作成は裏で進める (届いた時点で各画面に反映される)
  useEffect(() => {
    if (uid) initializeUserData(uid).catch(reportSyncError);
  }, [uid]);

  if (user === undefined) return <p className="loading">読み込み中…</p>;
  if (user === null) return <LoginPage />;

  return (
    <UserProvider value={user}>
      <FeaturesProvider value={features}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/new" element={<TransactionFormPage />} />
            <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
            {/* 「使う機能」でオフにできる画面。オフのときは画面の代わりに案内を出す */}
            <Route element={<FeatureGate feature="accounts" />}>
              <Route path="/accounts" element={<AccountsPage />} />
            </Route>
            <Route element={<FeatureGate feature="calendar" />}>
              <Route path="/reports/calendar" element={<CalendarReportPage />} />
            </Route>
            <Route element={<FeatureGate feature="categoryReport" />}>
              <Route path="/reports/category" element={<CategoryReportPage />} />
            </Route>
            <Route element={<FeatureGate feature="paymentMethodReport" />}>
              <Route
                path="/reports/payment-methods"
                element={<PaymentMethodReportPage />}
              />
            </Route>
            <Route element={<FeatureGate feature="recurring" />}>
              <Route path="/recurring" element={<RecurringPage />} />
            </Route>
            <Route element={<FeatureGate feature="shifts" />}>
              <Route path="/shifts" element={<ShiftCalendarPage />} />
              <Route path="/salary" element={<SalaryPage />} />
              <Route path="/settings/workplaces" element={<WorkplacesPage />} />
            </Route>
            <Route path="/settings/categories" element={<CategoriesPage />} />
            <Route
              path="/settings/payment-methods"
              element={<PaymentMethodsPage />}
            />
            <Route path="/settings/features" element={<FeaturesPage />} />
            <Route path="/settings/data" element={<DataPage />} />
            <Route path="*" element={<p>ページが見つかりません。</p>} />
          </Route>
        </Routes>
      </FeaturesProvider>
    </UserProvider>
  );
}
