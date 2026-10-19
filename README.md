# 家計簿アプリ

日々の収支を記録し、カテゴリ別・支払い方法別に集計するブラウザアプリです。クレジットカードは締め日・支払日から請求予定額を算出できます。

**👉 [アプリを開く](https://ryunosukefootball0628-cmyk.github.io/kakeibo-app/)**

Google アカウントでログインするだけで使えます。記録はクラウドに保存され、同じアカウントでログインしたスマホと PC の間で自動的に同期されます。スマホのブラウザで開き、「ホーム画面に追加」しておくとアプリのように使えます。

## データの保存場所

入力したデータは Google の Firebase（Cloud Firestore）に、ログインしたアカウントごとに分けて保存されます。

- **他の利用者からは見えません。** ログインした本人以外は読み書きできないよう、データベースのルール（[firestore.rules](firestore.rules)）で制限しています
- **アプリの管理者は閲覧できる立場にあります。** 保存先のデータベースはこのアプリの管理者の Firebase プロジェクトです。気になる場合は、下の手順でご自身の Firebase プロジェクトを用意して動かすこともできます
- **電波がなくても入力できます。** 端末内に一時保存され、つながったときに自動で送信されます
- **ログアウトすると、端末内のコピーは削除されます。** クラウドの記録はそのまま残り、再ログインすると戻ります
- 「アカウント・データ」画面から、JSON への書き出し・取り込み、アカウントと全データの削除ができます

### 以前のバージョンを使っていた方へ

クラウド同期に対応する前は、記録をブラウザ内（IndexedDB）だけに保存していました。その記録が残っている端末でログインすると、ダッシュボードにクラウドへの取り込みを案内する表示が出ます。複数の端末で取り込んでも、同じ記録が重複することはありません。

## 主な機能

| 機能 | 内容 |
|---|---|
| 収支の記録 | 日付・金額・カテゴリ・支払い方法・メモを登録。月単位の一覧と絞り込み |
| 日別カレンダー | 月のカレンダーに日ごとの収入・支出を表示。日付を選ぶとその日の取引を確認・追加できる |
| カテゴリ別集計 | 構成比の円グラフと内訳表、直近6ヶ月の収支推移 |
| 支払い方法別集計 | 現金・口座・カードごとの内訳 |
| カード請求額 | 締め日・支払日の設定から、対象期間と請求予定額を3ヶ月先まで算出 |
| 定期支出・サブスク | 毎月／毎年の固定費を登録。発生月に確認して記録（二重登録を防ぐため自動登録はしません） |
| 同期 | Google アカウントでログインし、端末間で記録を同期。オフラインでも入力可能 |
| アカウント・データ | ログアウト、JSON のエクスポート／インポート、初期化、アカウントの削除 |

カテゴリと支払い方法は自由に追加・編集できます。

## 開発

```bash
npm install
```

### Firebase の準備

自分の Firebase プロジェクトで動かす場合の手順です。無料の Spark プランで動きます。

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作成する（Google アナリティクスは不要）
2. **Authentication** → 「始める」→「ログイン方法」で **Google** を有効にする
3. **Authentication** →「設定」→「承認済みドメイン」に公開先のドメイン（例: `<user>.github.io`）を追加する。`localhost` は最初から入っている
4. **Firestore Database** →「データベースを作成」で、Standard エディション・本番環境モード・ロケーション `asia-northeast1`（東京）を選ぶ
5. **Firestore Database** →「ルール」に [firestore.rules](firestore.rules) の内容を貼り付けて公開する
6. 「プロジェクトの設定」→「マイアプリ」でウェブアプリ（`</>`）を追加し、表示される `firebaseConfig` の値を控える
7. `.env.example` を `.env.local` という名前でコピーし、控えた値を書き込む

`firebaseConfig` の値はブラウザに配信される公開値で、秘密情報ではありません（アクセスの制限はルールが担います）。それでも気になる場合は、Google Cloud コンソールで API キーに HTTP リファラーの制限（公開先のドメインと `localhost`）をかけておくと安心です。

```bash
npm run dev
```

### エミュレーターで試す

Firebase のプロジェクトを作らなくても、ローカルのエミュレーターで動かせます。Java 11 以上が必要です。ログイン画面では、実在しない仮のアカウントを作って入れます。

```bash
npm run emulators
```

```bash
npm run dev:emulator
```

### テスト

データベースのルール（本人以外が読み書きできないこと、保存できる形式）を、エミュレーター上で検証します。

```bash
npm run test:rules
```

### 公開

`main` ブランチに push すると GitHub Actions が自動でビルドし、GitHub Pages へ公開します。事前にリポジトリの Settings →「Secrets and variables」→「Actions」→「Variables」に、次の 4 つを登録してください（未登録だとビルドが失敗します）。

| 名前 | 値 |
|---|---|
| `FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` |
| `FIREBASE_APP_ID` | `firebaseConfig.appId` |

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md) を参照してください。

## 技術構成

React 18 / TypeScript / Vite / Firebase（Authentication・Cloud Firestore）/ Recharts / React Router

静的サイトとして GitHub Pages で配信し、データの保存とログインに Firebase を使います。Content Security Policy で通信先を Firebase の API だけに限定しており、依存パッケージに不正なコードが混入しても他の宛先へデータを送れないようにしています。

## ライセンス

MIT License — [LICENSE](LICENSE) を参照してください。
