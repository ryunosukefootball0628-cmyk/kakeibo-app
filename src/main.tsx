import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * Firebase Hosting は <project>.web.app と <project>.firebaseapp.com の両方で配信される。
 * ログインの中継ページ (authDomain) と別のドメインで開くとスマホでログインに失敗するため、
 * authDomain 以外の Firebase Hosting のドメインで開かれたら authDomain へ移す。
 */
function redirectToAuthDomain(): boolean {
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!authDomain || location.host !== `${projectId}.web.app`) return false;
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
