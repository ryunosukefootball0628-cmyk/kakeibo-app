import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import SyncStatus from './SyncStatus';
import UpdateNotice from './UpdateNotice';

const NAV_GROUPS: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: 'メイン',
    items: [
      { to: '/', label: 'ダッシュボード' },
      { to: '/transactions', label: '取引一覧' },
    ],
  },
  {
    label: 'シフト・給与',
    items: [
      { to: '/shifts', label: 'シフト' },
      { to: '/salary', label: '給与' },
      { to: '/settings/workplaces', label: '勤務先設定' },
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
  // スマホ幅でだけ使う。PC 幅ではメニューを常に出し、開閉ボタンも隠す
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-header">
          <div className="sidebar-title">家計簿</div>
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
          >
            {menuOpen ? '✕ 閉じる' : '☰ メニュー'}
          </button>
        </div>
        <nav className="nav" id="main-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  // 画面を選んだら閉じて、その画面の中身を見せる
                  onClick={() => setMenuOpen(false)}
                >
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
      <UpdateNotice />
    </div>
  );
}
