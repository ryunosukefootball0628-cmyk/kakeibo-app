import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  terminate,
  waitForPendingWrites,
} from 'firebase/firestore';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, firestore } from '../firebase';

/**
 * ログインの中継ページ (authDomain の /__/auth/handler) がアプリと同じドメインにあるとき
 * (Firebase Hosting で配信しているとき) は、同じタブで Google の画面へ移るリダイレクト方式を使う。
 * スマホではポップアップが別タブで開かれ、途中の情報が失われて失敗することがあるため。
 *
 * 別ドメインのまま (localhost での開発時) リダイレクトすると、ブラウザのストレージ分離で
 * 中継ページの情報が読めずに失敗するので、そのときだけポップアップ方式にする。
 */
export const usesRedirect = auth.config.authDomain === window.location.host;

function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** リダイレクト方式では Google の画面へ移動するため、この Promise は完了しない */
export async function signInWithGoogle(): Promise<void> {
  if (usesRedirect) {
    await signInWithRedirect(auth, googleProvider());
  } else {
    await signInWithPopup(auth, googleProvider());
  }
}

/**
 * リダイレクト方式でのログイン・本人確認の失敗は、戻ってきたページの読み込み時に
 * ここで受け取る (呼ばないとエラーが握りつぶされる)。
 */
export async function completeRedirect(): Promise<void> {
  await getRedirectResult(auth);
}

/**
 * アカウント削除の前に、本人であることを確かめ直す。
 * リダイレクト方式では Google の画面へ移動し、戻ってきたら元の画面が読み込み直される。
 */
export async function reauthenticate(user: User): Promise<void> {
  if (usesRedirect) {
    await reauthenticateWithRedirect(user, googleProvider());
  } else {
    await reauthenticateWithPopup(user, googleProvider());
  }
}

/**
 * Firebase はアカウント削除などに「直近 5 分以内のログイン」を求める。
 * 削除の途中で期限が切れないよう、少し余裕を持って判定する。
 */
export async function isRecentlySignedIn(user: User): Promise<boolean> {
  const { authTime } = await user.getIdTokenResult();
  return Date.now() - Date.parse(authTime) < 4 * 60 * 1000;
}

/** 未送信の書き込みが残っているか。オフラインだと送信が終わらないので一定時間で見切る */
export async function hasPendingWrites(timeoutMs = 3000): Promise<boolean> {
  const sent = waitForPendingWrites(firestore).then(() => false);
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(true), timeoutMs),
  );
  return Promise.race([sent, timeout]);
}

/**
 * 端末に残した Firestore のキャッシュを消して再読み込みする。共用の PC で次に使う人の
 * 手元に家計データが残らないようにするため。キャッシュを消すと Firestore は使えなくなる。
 */
export async function clearCacheAndReload(): Promise<void> {
  await terminate(firestore);
  try {
    await clearIndexedDbPersistence(firestore);
  } catch {
    // 別のタブで開いているとキャッシュを消せない。次のログインは別のパスを読むので他人のデータは表示されない
  }
  window.location.reload();
}

export async function signOutAndClearCache(): Promise<void> {
  await signOut(auth);
  await clearCacheAndReload();
}

/** undefined = 確認中, null = 未ログイン */
export function useAuthState(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(
    () => auth.currentUser ?? undefined,
  );
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

const UserContext = createContext<User | null>(null);

export const UserProvider = UserContext.Provider;

/** ログイン後の画面でのみ使う */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser はログイン後の画面でのみ使えます。');
  return user;
}
