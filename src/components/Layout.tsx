import { NavLink, Outlet } from 'react-router-dom';
import SyncStatus from './SyncStatus';

const NAV_GROUPS: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: 'メイン',
    items: [
      { to: '/', label: 'ダッシュボード' },
      { to: '/transactions', label: '取引一覧' },
    ],
  },
  {
    label: '集計',
    items: [
      { to: '/reports/calendar', label: 'カレンダー' },
      { to: '/reports/category', label: 'カテゴリ別' },
      { to: '/reports/payment-methods', label: '支払い方法別' },
    ],
  },
  {
    label: '管理',
    items: [
      { to: '/recurring', label: '定期支出' },
      { to: '/settings/categories', label: 'カテゴリ設定' },
      { to: '/settings/payment-methods', label: '支払い方法設定' },
      { to: '/settings/data', label: 'アカウント・データ' },
    ],
  },
];

export default function Layout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">家計簿</div>
        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <SyncStatus />
        <Outlet />
      </main>
    </div>
  );
}
