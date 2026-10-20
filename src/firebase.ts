import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Firebase の Web 設定。ブラウザに配信される公開値で秘密ではない (アクセス制御は
 * firestore.rules が担う)。開発時は .env.local、GitHub Actions ではリポジトリの
 * Variables から渡す。
 */
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * npm run dev:emulator のときはローカルのエミュレーターにつなぐ。
 * "demo-" で始まるプロジェクト ID は実在のプロジェクトに接続されないため、設定なしで試せる。
 */
const useEmulators =
  import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true';

const emulatorConfig = {
  apiKey: 'demo-api-key',
  // 本番 (Firebase Hosting) と同じく、ログインの中継ページがアプリと同じドメインにある扱いにする
  authDomain: window.location.host,
  projectId: 'demo-kakeibo',
  appId: 'demo-app',
};

export const isFirebaseConfigured =
  useEmulators || Object.values(envConfig).every(Boolean);

// 未設定でも getAuth が例外を投げないよう仮の値で初期化する (画面側で設定手順を案内する)
const app = initializeApp(
  useEmulators
    ? emulatorConfig
    : isFirebaseConfigured
      ? envConfig
      : { apiKey: 'unset', projectId: 'unset', appId: 'unset' },
);

export const auth = getAuth(app);

/**
 * オフラインでも閲覧・入力できるよう、端末の IndexedDB にキャッシュを持つ。
 * 書き込みはまずキャッシュに反映され、接続が戻るとサーバーへ送られる。
 * 複数タブで開いても同じキャッシュを共有できるよう multiple tab manager を使う。
 */
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  // 任意項目 (memo など) を undefined のまま渡せるようにする
  ignoreUndefinedProperties: true,
});

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}
