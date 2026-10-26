import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useFeatures } from '../hooks/useFeatures';
import type { FeatureId } from '../optionalFeatures';
import SyncStatus from './SyncStatus';
import UpdateNotice from './UpdateNotice';

interface NavItem {
  to: string;
  label: string;
  /** 「使う機能」でオフにできる機能の画面 */
  feature?: FeatureId;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'メイン',
    items: [
      { to: '/', label: 'ダッシュボード' },
      { to: '/transactions', label: '取引一覧' },
      { to: '/accounts', label: '口座残高', feature: 'accounts' },
    ],
  },
  {
    label: 'シフト・給与',
    items: [
      { to: '/shifts', label: 'シフト', feature: 'shifts' },
      { to: '/salary', label: '給与', feature: 'shifts' },
      { to: '/settings/workplaces', label: '勤務先設定', feature: 'shifts' },
    ],
  },
  {
    label: '集計',
    items: [
      { to: '/reports/calendar', label: 'カレンダー', feature: 'calendar' },
      { to: '/reports/category', label: 'カテゴリ別', feature: 'categoryReport' },
      {
        to: '/reports/payment-methods',
        label: '支払い方法別',
        feature: 'paymentMethodReport',
      },
    ],
  },
  {
    label: '管理',
    items: [
      { to: '/recurring', label: '定期支出', feature: 'recurring' },
      { to: '/settings/categories', label: 'カテゴリ設定' },
      { to: '/settings/payment-methods', label: '支払い方法設定' },
      { to: '/settings/features', label: '使う機能' },
      { to: '/settings/data', label: 'アカウント・データ' },
    ],
  },
];

export default function Layout() {
  // スマホ幅でだけ使う。PC 幅ではメニューを常に出し、開閉ボタンも隠す
  const [menuOpen, setMenuOpen] = useState(false);
  const features = useFeatures();

  // 設定が届くまではすべて出す。ほとんどの人はすべて使うので、開くたびにメニューが後から伸びないようにする
  const shown = (item: NavItem) =>
    !item.feature || features.loading || features.isEnabled(item.feature);
  // 項目がすべてオフのグループは見出しごと出さない
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(shown),
  })).filter((group) => group.items.length > 0);

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
          {groups.map((group) => (
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
