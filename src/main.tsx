import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * Firebase Hosting は 1 つのサイトを <site>.web.app と <site>.firebaseapp.com の両方で配信する。
 * さらに以前のアドレス (<project>.firebaseapp.com) のサイトにも同じアプリを置いている。
 * ログインの中継ページ (authDomain) と別のドメインで開くとスマホでログインに失敗するため、
 * authDomain 以外の Firebase Hosting のドメインで開かれたら authDomain へ移す。
 */
function redirectToAuthDomain(): boolean {
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const onFirebaseHosting = /\.(web\.app|firebaseapp\.com)$/.test(location.host);
  if (!authDomain || !onFirebaseHosting || location.host === authDomain) return false;
  location.replace(`https://${authDomain}/${location.hash}`);
  return true;
}

// URL は #/transactions の形式にする。GitHub Pages で配信していた頃のブックマークや
// 他の画面からの戻り先 (returnTo) がこの形式のため
if (!redirectToAuthDomain()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
}
