/**
 * 「使う機能」の画面 (src/features/settings/FeaturesPage.tsx) でオン・オフを選べる機能。
 * オフにした機能はメニューに出さず、ダッシュボードなどほかの画面にも出さない。そのデータも読まない。
 * 記録は消さないので、オンに戻すと元どおり表示される。
 *
 * オフにした機能の id は users/{uid} の disabledFeatures に保存する。
 * - 機能を足すときは firestore.rules の isFeatureList にも id を足し、ルールを先に反映する
 *   (古いルールのままだと、その機能をオフにする書き込みが拒否される)
 * - id は保存されるので変えない
 */
export type FeatureId =
  | 'accounts'
  | 'shifts'
  | 'calendar'
  | 'categoryReport'
  | 'paymentMethodReport'
  | 'recurring';

export interface OptionalFeature {
  id: FeatureId;
  label: string;
  /** 「使う機能」の画面に出す説明 */
  description: string;
}

/** メニューと同じ順に並べる */
export const OPTIONAL_FEATURES: OptionalFeature[] = [
  {
    id: 'accounts',
    label: '口座残高',
    description:
      '銀行口座の今日の残高と、来月末までの残高の見込みを確認します。カードの引き落とし口座の設定も、この機能に含まれます。',
  },
  {
    id: 'shifts',
    label: 'シフト・給与',
    description:
      'アルバイトなどのシフトを記録して給料の見込みを確認し、振り込まれた額を収入として記録します（シフト・給与・勤務先設定）。',
  },
  {
    id: 'calendar',
    label: '日別カレンダー',
    description: '月のカレンダーで、日ごとの収入・支出を確認します。',
  },
  {
    id: 'categoryReport',
    label: 'カテゴリ別集計',
    description: 'カテゴリごとの構成比と内訳、月別の収支の推移を確認します。',
  },
  {
    id: 'paymentMethodReport',
    label: '支払い方法別集計',
    description: '支払い方法ごとの支出と、カードの請求予定額を 3 か月先まで確認します。',
  },
  {
    id: 'recurring',
    label: '定期支出',
    description: 'サブスクや家賃などの固定費を登録し、発生した月に確認して記録します。',
  },
];

const FEATURE_IDS = new Set<string>(OPTIONAL_FEATURES.map((feature) => feature.id));

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === 'string' && FEATURE_IDS.has(value);
}
