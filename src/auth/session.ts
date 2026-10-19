import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
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
 * リダイレクト方式はアプリと認証ドメインが別 (github.io と firebaseapp.com) だと
 * Safari などのサードパーティ Cookie 制限で失敗するため、ポップアップ方式を使う。
 */
function googleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider());
}

/** アカウント削除のような操作の前に、本人であることを確かめ直す */
export async function reauthenticate(user: User): Promise<void> {
  await reauthenticateWithPopup(user, googleProvider());
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
