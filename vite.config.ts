import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages は https://<user>.github.io/<repo>/ で配信されるため、
// Actions 上ではリポジトリ名を base にする (ローカルでは "/" のまま)
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];

/**
 * このアプリは一切の外部通信を行わないため、connect-src 'none' で通信手段そのものを塞ぐ。
 * 依存パッケージに混入したコードであっても家計データを送信できなくなる。
 * style-src の 'unsafe-inline' は React / Recharts が style 属性を使うため外せない。
 *
 * 開発時は Vite の HMR が WebSocket を張るので、本番ビルドにのみ適用する。
 */
const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig({
  base: repository ? `/${repository}/` : '/',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    // 同じ Wi-Fi のスマホから開けるよう、LAN のアドレスでも待ち受ける
    host: true,
    port: 5173,
  },
});
