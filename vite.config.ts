import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages は https://<user>.github.io/<repo>/ で配信されるため、
// Actions 上ではリポジトリ名を base にする (ローカルでは "/" のまま)
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  base: repository ? `/${repository}/` : '/',
  plugins: [react()],
  server: {
    // 同じ Wi-Fi のスマホから開けるよう、LAN のアドレスでも待ち受ける
    host: true,
    port: 5173,
  },
});
