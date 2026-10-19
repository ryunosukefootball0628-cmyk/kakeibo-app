import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages は https://<user>.github.io/<repo>/ で配信されるため、
// Actions 上ではリポジトリ名を base にする (ローカルでは "/" のまま)
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];

/**
 * 通信先を Firebase のデータ保存 (Firestore) とログイン (Authentication) に限定する。
 * 依存パッケージに混入したコードであっても、それ以外の宛先へ家計データを送信できなくなる。
 * - script-src の apis.google.com と frame-src の認証ドメインは、Google ログインの
 *   ポップアップとのやり取りに Firebase が使う
 * - style-src の 'unsafe-inline' は React / Recharts が style 属性を使うため外せない
 *
 * 開発時は Vite の HMR が WebSocket を張るので、本番ビルドにのみ適用する。
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

export default defineConfig(({ mode }) => {
  // .env.local と、Actions で渡す環境変数の両方から読む
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: repository ? `/${repository}/` : '/',
    plugins: [react(), contentSecurityPolicy(env.VITE_FIREBASE_AUTH_DOMAIN)],
    server: {
      // 同じ Wi-Fi のスマホから開けるよう、LAN のアドレスでも待ち受ける
      host: true,
      port: 5173,
    },
  };
});
