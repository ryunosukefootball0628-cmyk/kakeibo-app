import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 通信先を Firebase のデータ保存 (Firestore) とログイン (Authentication) に限定する。
 * 依存パッケージに混入したコードであっても、それ以外の宛先へ家計データを送信できなくなる。
 * - script-src の apis.google.com と frame-src の認証ドメインは、Google ログインの
 *   中継ページとのやり取りに Firebase が使う (本番では認証ドメイン = 配信ドメイン)
 * - style-src の 'unsafe-inline' は React / Recharts が style 属性を使うため外せない
 *
 * 開発時は Vite の HMR が WebSocket を張るので、本番ビルドにのみ適用する。
 * meta タグでは指定できない frame-ancestors は firebase.json のヘッダーで指定している。
 */
const csp = (authDomain: string | undefined) =>
  [
    "default-src 'self'",
    [
      'connect-src',
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
    ].join(' '),
    "script-src 'self' https://apis.google.com",
    `frame-src ${authDomain ? `https://${authDomain}` : "'none'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

const contentSecurityPolicy = (authDomain: string | undefined): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: csp(authDomain) },
      injectTo: 'head-prepend',
    },
  ],
});

/**
 * npm run dev:emulator のとき、認証エミュレーター (127.0.0.1:9099) への通信を開発サーバーが中継する。
 * エミュレーターのログインの中継ページ (/emulator/auth/handler) は、リダイレクトの結果を自分の
 * オリジンの sessionStorage に置き、アプリに埋め込んだ同じオリジンの iframe から読ませる。
 * アプリと別オリジンのままだと、ブラウザのストレージ分離で iframe からは読めずログインが完了しない。
 * 本番で中継ページを配信ドメインに置いているのと同じ理由 (src/auth/session.ts)。
 */
const authEmulatorProxy = Object.fromEntries(
  ['/emulator', '/identitytoolkit.googleapis.com', '/securetoken.googleapis.com'].map(
    (path) => [path, 'http://127.0.0.1:9099'],
  ),
);

export default defineConfig(({ mode }) => {
  // .env.local と、Actions で渡す環境変数の両方から読む
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_FIREBASE_AUTH_DOMAIN)],
    server: {
      // 同じ Wi-Fi のスマホから開けるよう、LAN のアドレスでも待ち受ける
      host: true,
      port: 5173,
      proxy: env.VITE_FIREBASE_EMULATORS === 'true' ? authEmulatorProxy : undefined,
    },
  };
});
