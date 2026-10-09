# 家計簿アプリ 設計書

## 1. 概要

個人利用を目的とした家計簿 Web アプリ。日々の収支を記録し、カテゴリ別・支払い方法別に集計・グラフ化する。サーバーを持たず、ブラウザ内にすべてのデータを保存する。

### 1.1 目的
- 収入・支出を簡単に記録できる
- カテゴリ別・支払い方法別の集計を見える化する
- クレジットカードなど支払い方法ごとの請求額を把握できる
- 定期支出・サブスクの管理により、固定費の見落としを防ぐ

### 1.2 対象ユーザー
- 自分専用の家計簿として利用する個人（マルチユーザー・共有機能は対象外）

## 2. 動作環境・技術スタック

| 項目 | 選定内容 | 理由 |
|---|---|---|
| 種別 | Web アプリ（SPA） | PC・スマホのブラウザで共通利用可能 |
| 言語 | TypeScript | 型安全性、保守性 |
| フレームワーク | React + Vite | 開発体験が良く、ビルドが高速 |
| スタイリング | 単一のグローバル CSS（CSS 変数によるテーマ） | 依存を増やさず、ライト/ダーク対応も容易 |
| データ保存 | IndexedDB（Dexie.js 経由） | localStorage より大容量・構造化データに強く、将来の件数増加に耐える |
| グラフ描画 | Recharts | React との親和性が高い |
| ルーティング | React Router | 画面数が少ないため軽量に |
| 状態管理 | React Context + hooks（必要に応じて拡張） | 小規模なので外部ライブラリは最初は不要 |

※ サーバー・外部 API は使用しない。バックアップ/復元のため、JSON エクスポート・インポート機能を用意する（後述）。

## 3. 機能要件

### 3.1 収支の記録・一覧（必須・優先度高）
- 収入／支出の登録（日付、金額、カテゴリ、支払い方法、メモ）
- 一覧表示（日付降順、月単位の絞り込み）
- 編集・削除
- 検索・フィルタ（カテゴリ、支払い方法、期間、キーワード）

### 3.2 カテゴリ別集計・グラフ（優先度高）
- 月単位でのカテゴリ別合計（円グラフ）
- 期間指定での月別推移（折れ線・棒グラフ）
- カテゴリは初期セットを用意しつつユーザーが追加・編集・削除可能

### 3.3 支払い方法別集計・カード請求額確認（優先度高）
- 支払い方法（現金、銀行口座、クレジットカードA/Bなど）をユーザーが登録
- 支払い方法別の月間合計を一覧表示
- クレジットカードは「締め日」「支払日」「支払いタイミング（当月／翌月／翌々月）」を設定でき、締め期間に基づいた請求予定額を算出・表示
- 請求額の算出ルール: ある支払月 P の締め月は `P - paymentMonthOffset`。対象期間は「締め月の前月の締め日の翌日」〜「締め月の締め日」。
  - 例1）15日締め・**翌月**27日払い（offset = 1）で 2026年11月の支払い → 対象期間 2026-09-16 〜 2026-10-15、支払日 2026-11-27
  - 例2）15日締め・**当月**27日払い（offset = 0）で 2026年10月の支払い → 対象期間 2026-09-16 〜 2026-10-15、支払日 2026-10-27
- 支払い方法別集計画面では、選択月から3ヶ月先までの請求予定額を一覧表示する

### 3.4 定期支出・サブスク管理（優先度中）
- 定期支出（サブスク、家賃、保険など）をテンプレート登録（金額、カテゴリ、支払い方法、サイクル：毎月／毎年、発生日）
- 登録した定期支出を、対象月が来たら手動確認のうえ実績の取引として反映（自動生成候補を表示→ユーザーが承認して確定、の方式。意図しない重複登録を避けるため全自動登録は行わない）
- 定期支出の一覧・停止/再開・編集・削除

### 3.5 予算管理（任意・将来拡張）
- 今回のスコープ外。カテゴリ別の月間予算設定・超過警告は将来拡張として設計上の余地だけ残す（データモデルに budget テーブルを追加しやすい形にする）。

## 4. データモデル

IndexedDB 上に以下のテーブル（オブジェクトストア）を設計する。

### Transaction（取引）
| フィールド | 型 | 説明 |
|---|---|---|
| id | string (uuid) | 主キー |
| type | "income" \| "expense" | 収入/支出 |
| date | string (ISO date) | 発生日 |
| amount | number | 金額（円、整数） |
| categoryId | string | Category への参照 |
| paymentMethodId | string | PaymentMethod への参照 |
| memo | string? | メモ |
| recurringSourceId | string? | 定期支出から生成された場合の参照元 |
| createdAt / updatedAt | string (ISO datetime) | 記録用タイムスタンプ |

### Category（カテゴリ）
| フィールド | 型 | 説明 |
|---|---|---|
| id | string | 主キー |
| name | string | カテゴリ名 |
| type | "income" \| "expense" | 収入/支出どちらで使うか |
| color | string | グラフ表示用の色 |
| sortOrder | number | 表示順 |

初期カテゴリ例（支出）：食費、日用品、交通費、住居費、通信費、娯楽、医療、その他
初期カテゴリ例（収入）：給与、副業、その他

### PaymentMethod（支払い方法）
| フィールド | 型 | 説明 |
|---|---|---|
| id | string | 主キー |
| name | string | 表示名（例: 三井住友カード） |
| kind | "cash" \| "bank" \| "credit_card" | 種別 |
| closingDay | number? | 締め日（credit_card のみ、1-31、月末は31扱い） |
| paymentDay | number? | 支払日（credit_card のみ、月末は31扱い） |
| paymentMonthOffset | number? | 締め月から支払月までの差（0 = 当月払い, 1 = 翌月払い, 2 = 翌々月払い） |
| sortOrder | number | 表示順 |

### RecurringExpense（定期支出テンプレート）
| フィールド | 型 | 説明 |
|---|---|---|
| id | string | 主キー |
| name | string | 名称（例: Netflix） |
| amount | number | 金額 |
| categoryId | string | Category への参照 |
| paymentMethodId | string | PaymentMethod への参照 |
| cycle | "monthly" \| "yearly" | 発生サイクル |
| dayOfMonth | number | 発生日（1-31、月末は31扱い） |
| monthOfYear | number? | 発生月（1-12、cycle = "yearly" のみ） |
| isActive | boolean | 停止中かどうか |
| memo | string? | メモ |

### スキーマのバージョン管理

Dexie の `version()` で管理する。データの互換性が崩れる変更を入れる場合は `upgrade()` で既存レコードを変換する。

| DB version | 内容 |
|---|---|
| 1 | 初期スキーマ |
| 2 | `paymentMonthOffset` の基準を「翌月 = 0」から「当月 = 0」へ変更。既存のクレジットカードは値を +1 して従来の支払い月を維持する |

JSON バックアップにも同じ事情があるため `BackupData.version` を 2 に上げ、version 1 のファイルを取り込む際は同じ変換を行う。

### （将来拡張）Budget
| フィールド | 型 | 説明 |
|---|---|---|
| id | string | 主キー |
| categoryId | string | 対象カテゴリ |
| yearMonth | string | 対象月（YYYY-MM） |
| limitAmount | number | 予算上限 |

## 5. 画面構成

| 画面 | パス | 内容 |
|---|---|---|
| ダッシュボード | `/` | 今月の収支サマリ、カテゴリ別円グラフ、支払い方法別サマリ、未確認の定期支出アラート |
| 取引一覧 | `/transactions` | 一覧・検索・フィルタ、登録/編集/削除への入口 |
| 取引登録・編集 | `/transactions/new`, `/transactions/:id/edit` | フォーム |
| カテゴリ別集計 | `/reports/category` | 月別・期間別のグラフと詳細テーブル |
| 支払い方法別集計 | `/reports/payment-methods` | 支払い方法ごとの合計、カード請求予定額 |
| 定期支出管理 | `/recurring` | テンプレート一覧、登録/編集/削除、今月分の確認・反映 |
| カテゴリ・支払い方法設定 | `/settings/categories`, `/settings/payment-methods` | マスタ管理 |
| データ管理 | `/settings/data` | JSON エクスポート／インポート |

## 6. ディレクトリ構成

```
kakeibo-app/
├─ docs/
│   └─ DESIGN.md
├─ src/
│   ├─ main.tsx
│   ├─ App.tsx          # ルーティング定義
│   ├─ index.css        # CSS 変数によるテーマと共通スタイル
│   ├─ db/
│   │   ├─ db.ts        # Dexie スキーマ定義・初期データ
│   │   └─ operations.ts # 取引の登録/更新/削除、バックアップ入出力
│   ├─ features/
│   │   ├─ dashboard/
│   │   ├─ transactions/
│   │   ├─ recurring/
│   │   ├─ reports/     # カテゴリ別・支払い方法別
│   │   └─ settings/    # カテゴリ、支払い方法、データ管理
│   ├─ components/      # Layout, MonthSelector, グラフ共通設定
│   ├─ hooks/           # useLiveQuery ベースのデータ取得
│   ├─ utils/           # date / money / billing / recurring
│   └─ types/
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 6.1 起動方法

```
npm install
npm run dev     # http://localhost:5173
npm run build   # 型チェック + 本番ビルド
```

## 7. 非機能要件

- データはすべてブラウザのローカル（IndexedDB）に保存し、外部送信しない
- ブラウザのデータ消去でデータが失われるリスクがあるため、JSON エクスポート/インポートによるバックアップ手段を必須機能として提供する
- レスポンシブ対応（スマホ幅でも操作可能なレイアウト）
- 金額計算は浮動小数点誤差を避けるため、円単位の整数で保持する

## 8. デプロイ

GitHub Pages で静的ホスティングする。`main` への push をトリガーに GitHub Actions（`.github/workflows/deploy.yml`）がビルドし、`dist` をそのまま配信する。

| 論点 | 対応 |
|---|---|
| 配信パス | Pages は `https://<user>.github.io/<repo>/` で配信されるため、Actions 上では環境変数 `GITHUB_REPOSITORY` からリポジトリ名を取り出して Vite の `base` に設定する。ローカル開発では `/` のまま |
| ルーティング | Pages はサーバー側のリライトに対応しておらず、`/transactions` を直接開くと 404 になる。このため `HashRouter` を採用し、URL は `#/transactions` 形式とする |
| 公開範囲 | 無料プランで Pages を使うためリポジトリは Public。公開されるのはソースコードのみで、家計簿のデータは各端末のブラウザ内にあるためリポジトリには含まれない |
| データ同期 | 配信元が同じでも IndexedDB は端末・ブラウザごとに独立しているため、PC とスマホでデータは共有されない。移行する場合はデータ管理画面の JSON エクスポート／インポートを使う |

### セキュリティ方針

このアプリは一切の外部通信を行わない。この性質を宣言で終わらせず、`connect-src 'none'` を含む CSP をビルド時に `index.html` へ挿入して、ブラウザ側で通信手段そのものを塞ぐ。依存パッケージに将来悪意のあるコードが混入しても、家計データを送信できない。

- `style-src` に `'unsafe-inline'` が必要: React と Recharts が `style` 属性を使うため
- CSP は本番ビルドにのみ適用する: 開発時は Vite の HMR が WebSocket を使うため（`vite.config.ts` の `apply: 'build'`）
- `frame-ancestors` は meta タグでは指定できず、GitHub Pages ではヘッダーも設定できないため、クリックジャッキングは防げない。ただし破壊的操作（全データ削除）には `window.confirm` を挟んでおり、ネイティブダイアログは重ねてクリックさせられないため実害は限定的

### データ消失対策

ローカル保存のみという性質上、最大のリスクはブラウザのデータ消去による消失。初回アクセス時に保存場所を説明する案内を表示し、以後はバックアップから 30 日以上経過した場合にダッシュボードで促す（`StorageNotice`）。案内の既読状態と最終エクスポート日時は家計データではないため localStorage に置く。

## 9. 今後の拡張余地（今回は実装しない）
- 予算管理・超過アラート
- 複数デバイス間の同期（クラウド保存への切り替え）
- CSV取り込み（銀行/カード明細の自動取り込み）
