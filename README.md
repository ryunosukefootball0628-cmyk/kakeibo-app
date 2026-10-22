# 家計簿アプリ

日々の収支を記録し、カテゴリ別・支払い方法別に集計するブラウザアプリです。クレジットカードは締め日・支払日から請求予定額を算出できます。

**👉 [アプリを開く](https://kakeibo-pocket.web.app/)**

Google アカウントでログインするだけで使えます。記録はクラウドに保存され、同じアカウントでログインしたスマホと PC の間で自動的に同期されます。スマホのブラウザで開き、「ホーム画面に追加」しておくとアプリのように使えます。

LINE などのアプリ内で開いた画面では Google のログインが使えないため、Safari や Chrome で開いてください。

## データの保存場所

入力したデータは Google の Firebase（Cloud Firestore）に、ログインしたアカウントごとに分けて保存されます。

- **他の利用者からは見えません。** ログインした本人以外は読み書きできないよう、データベースのルール（[firestore.rules](firestore.rules)）で制限しています
- **アプリの管理者は閲覧できる立場にあります。** 保存先のデータベースはこのアプリの管理者の Firebase プロジェクトです。気になる場合は、下の手順でご自身の Firebase プロジェクトを用意して動かすこともできます
- **電波がなくても入力できます。** 端末内に一時保存され、つながったときに自動で送信されます
- **ログアウトすると、端末内のコピーは削除されます。** クラウドの記録はそのまま残り、再ログインすると戻ります
- 「アカウント・データ」画面から、JSON への書き出し・取り込み、アカウントと全データの削除ができます

### 以前のアドレスを使っていた方へ

以前は `https://ryunosukefootball0628-cmyk.github.io/kakeibo-app/` で配信していました。このアドレスを開くと新しいアドレスへ移動します。

クラウド同期に対応する前は、記録をブラウザ内だけに保存していました。その記録が残っている端末で以前のアドレスを開くと、移動せずに「記録をファイルに保存」ボタンが表示されます。保存したファイルを、新しいアドレスでログインしてから「アカウント・データ」→「インポート」で取り込んでください。

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
3. **Authentication** →「設定」→「承認済みドメイン」に `<project>.firebaseapp.com` と `localhost` が入っていることを確認する（最初から入っている）
4. **Firestore Database** →「データベースを作成」で、Standard エディション・本番環境モード・ロケーション `asia-northeast1`（東京）を選ぶ
5. **Firestore Database** →「ルール」に [firestore.rules](firestore.rules) の内容を貼り付けて公開する
6. 「プロジェクトの設定」→「マイアプリ」でウェブアプリ（`</>`）を追加し、表示される `firebaseConfig` の値を控える
7. `.env.example` を `.env.local` という名前でコピーし、控えた値を書き込む

`firebaseConfig` の値はブラウザに配信される公開値で、秘密情報ではありません（アクセスの制限はルールが担います）。ただし API キーは、使える API と呼び出し元のドメインを絞っておいてください（下の「セキュリティのための設定」）。

`.firebaserc` の `default` も自分のプロジェクト ID に書き換えてください。

```bash
npm run dev
```

開発サーバーはこの PC からの接続だけを受け付けます。同じ Wi-Fi のスマホで画面を確かめるときだけ、次のコマンドで LAN にも公開してください（カフェや学校などの共用 Wi-Fi では使わないでください。同じネットワークの誰からでも開発サーバーを開けるようになります）。なお LAN のアドレスはログインの承認済みドメインに無いため、スマホからはログインできません。

```bash
npm run dev:lan
```

### エミュレーターで試す

Firebase のプロジェクトを作らなくても、ローカルのエミュレーターで動かせます。Java 11 以上が必要です。ログイン画面では、実在しない仮のアカウントを作って入れます（「Add new account」→「Auto-generate user information」→「Sign in with Google.com」）。この PC のブラウザで `http://localhost:5173` を開いてください（スマホからはデータベースのエミュレーターにつながりません）。

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

アプリは Firebase Hosting（`https://kakeibo-pocket.web.app/`）で配信します。Google ログインの中継ページと同じドメインに置かないと、スマホでログインに失敗するためです。以前のアドレス（`https://kakeibo-app-ea14f.firebaseapp.com/`）で開いた場合は、自動で今のアドレスへ移ります。

`main` ブランチに push すると GitHub Actions が自動でビルドし、Firebase Hosting へ公開します。最初に一度だけ、次の準備が必要です。

1. 配信するサイトを作る。プロジェクト ID から決まる既定のアドレスは末尾にランダムな文字が付くことがあるため、名前を選べるサイトを追加する
   1. Firebase コンソールの **Hosting** →「別のサイトを追加」で、好きなサイト名を入力する（`https://<サイト名>.web.app/` になる）
   2. **Authentication** →「設定」→「承認済みドメイン」に `<サイト名>.web.app` を追加する
   3. [Google Cloud コンソールの「認証情報」](https://console.cloud.google.com/apis/credentials)で「Web client (auto created by Google Service)」を開き、「承認済みのリダイレクト URI」に `https://<サイト名>.web.app/__/auth/handler` を追加して保存する
   4. [firebase.json](firebase.json) の 1 つ目の `site` をサイト名に書き換える。2 つ目（`kakeibo-app-ea14f`）は以前のアドレスからの転送用なので、自分のプロジェクトで動かす場合は削除する

2. Firebase CLI にログインする。CLI はこの PC に管理者としてのログイン情報を保存し、それを使って動くため、版を固定して実行する（[package.json](package.json) の scripts と `.github/workflows/deploy.yml` の `firebaseToolsVersion` も同じ版。版を上げるときは 3 か所をそろえる）

   ```bash
   npx -y firebase-tools@15.34.0 login
   ```

3. GitHub Actions からデプロイするためのサービスアカウントを作り、リポジトリの Secrets に登録する。途中で GitHub へのログインを求められます。「build script を実行するか」「PR のマージで自動デプロイするか」はどちらも `N` で構いません（このリポジトリのワークフローを使うため）。最後に作られる `.github/workflows/firebase-hosting-*.yml` は削除してください

   ```bash
   npx -y firebase-tools@15.34.0 init hosting:github
   ```

   登録される Secret の名前は `FIREBASE_SERVICE_ACCOUNT_<プロジェクト ID>` です。別のプロジェクトで動かす場合は `.github/workflows/deploy.yml` の Secret 名も合わせてください

4. リポジトリの Settings →「Secrets and variables」→「Actions」→「Variables」に、次の 4 つを登録する（未登録だとビルドが失敗します）

| 名前 | 値 |
|---|---|
| `FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `FIREBASE_AUTH_DOMAIN` | 配信するサイトのドメイン（`<サイト名>.web.app`）。`firebaseConfig.authDomain` の値ではない |
| `FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` |
| `FIREBASE_APP_ID` | `firebaseConfig.appId` |

データベースのルール（[firestore.rules](firestore.rules)）は自動では反映されません。変更したら次のコマンドで反映します。

```bash
npx -y firebase-tools@15.34.0 deploy --only firestore:rules
```

GitHub Pages（以前の配信先）には、移転案内のページ（[moved/index.html](moved/index.html)）を公開しています。

### セキュリティのための設定

コードの外（各サービスの管理画面）でしかできない設定です。公開したら一度行ってください。

1. **デプロイ用サービスアカウントの権限を絞る。** `firebase init hosting:github` が作るサービスアカウント（`github-action-<数字>@<プロジェクト ID>.iam.gserviceaccount.com`）には、デプロイに不要な権限も付きます。[Google Cloud コンソールの IAM](https://console.cloud.google.com/iam-admin/iam) でこのアカウントの鉛筆アイコンを押し、次のロールを削除します。Secrets の鍵が漏れても、全利用者のアカウント情報を見たりプログラムを動かしたりできないようにするためです。削除後に GitHub の Actions タブから Deploy を手動実行（Run workflow）し、成功することを確かめてください
   - Firebase Authentication 管理者（`roles/firebaseauth.admin`。全利用者のメールアドレスの閲覧・削除ができる）
   - Cloud Functions 開発者（`roles/cloudfunctions.developer`）
   - Cloud Run 閲覧者（`roles/run.viewer`）

   残すのは「Firebase Hosting 管理者」「Service Usage ユーザー」「API キー閲覧者」です
2. **API キーを絞る。** [Google Cloud コンソールの「認証情報」](https://console.cloud.google.com/apis/credentials)で `firebaseConfig.apiKey` と同じ値のキー（Browser key (auto created by Firebase)）を開き、次のように設定します。同じプロジェクトで他の API（Gemini API など）を有効にしたとき、公開されているこのキーで呼び出されないようにするためです。保存後、ログインと記録の保存ができることを確かめてください
   - アプリケーションの制限: 「ウェブサイト」を選び、`https://kakeibo-pocket.web.app/*`、`https://kakeibo-pocket.firebaseapp.com/*`、`https://kakeibo-app-ea14f.web.app/*`、`https://kakeibo-app-ea14f.firebaseapp.com/*`、`http://localhost:5173/*` を追加する
   - API の制限: 「キーを制限」を選び、Identity Toolkit API、Token Service API、Cloud Firestore API の 3 つにする
3. **Authentication のログイン方法は Google だけにする。** 匿名やメール／パスワードは有効にしない（ルールでも Google 以外のアカウントは拒否しています）
4. **Dependabot を有効にする。** リポジトリの Settings →「Advanced Security」（または「Code security」）で「Dependabot alerts」と「Dependabot security updates」を有効にすると、使っているパッケージに脆弱性が見つかったときに通知と修正の PR が届きます

### 悪用されたときの対処

誰でも Google アカウントでログインできるため、悪意のある利用者が自分のアカウントから大量に読み書きすると、Spark プランの 1 日の無料枠（読み取り 5 万回、書き込み 2 万回、削除 2 万回）を使い切ります。そうなると、その日は全員が記録を保存・表示できなくなり、アプリには「サーバーの利用上限に達しました」と表示されます。無料枠は太平洋時間の 0 時ごろ（日本時間の 16 時、冬は 17 時ごろ）に戻ります。次の手順で同じアカウントからの再発を防いでください。

1. **使用量を確かめる。** Firebase コンソールの **Firestore Database** →「使用量」で、読み取り・書き込み・削除の回数が急に増えていないかを見る
2. **該当するアカウントを探す。** **Authentication** →「ユーザー」で、作成日やログイン日が最近の、見覚えのないアカウントを探してユーザー UID を控える。**Firestore Database** →「データ」で `users` → その UID →「transactions」などを開き、不審な記録が大量にあることを確かめる（画面に表示した件数だけ読み取りの回数を使います）
3. **アカウントを無効にする。** **Authentication** →「ユーザー」で該当アカウントの「︙」→「アカウントを無効にする」を選ぶ。ログインし直せなくなり、ログイン中の端末も 1 時間以内（ログインの有効期限が切れたとき）に読み書きできなくなる。**アカウントは削除しないでください。** 削除すると、同じ Google アカウントでもう一度ログインして使えるようになります
4. **データを消す。** **Firestore Database** →「データ」で `users` → その UID の下の各コレクション（transactions など）を「コレクションを削除」で消し、最後に UID のドキュメントを削除する。保存容量の無料枠（1 GiB）を圧迫するので早めに消す。削除も 1 日 2 万件の無料枠に数えられるため、量が多いときは数日に分ける

別のアカウントで繰り返される場合は、Firebase App Check の導入を検討してください。今は採用していません。理由と、見直すときの条件は [docs/DESIGN.md](docs/DESIGN.md) の「セキュリティ方針」に書いています。

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md) を参照してください。

## 技術構成

React 18 / TypeScript / Vite / Firebase（Authentication・Cloud Firestore）/ Recharts / React Router

静的サイトとして Firebase Hosting で配信し、データの保存とログインにも Firebase を使います。Content Security Policy で通信先を Firebase の API だけに限定しており、依存パッケージに不正なコードが混入しても他の宛先へデータを送れないようにしています。

## ライセンス

MIT License — [LICENSE](LICENSE) を参照してください。
