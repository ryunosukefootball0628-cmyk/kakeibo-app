import { FirebaseError } from 'firebase/app';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * 画面操作からの書き込みはサーバーの応答を待たないため、失敗はあとから届く。
 * それを画面上部にまとめて表示するための小さなストア。
 */
let lastError: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function reportSyncError(error: unknown): void {
  console.error(error);
  lastError = describeError(error);
  emit();
}

export function clearSyncError(): void {
  lastError = null;
  emit();
}

export function useSyncError(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lastError,
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

const MESSAGES: Record<string, string> = {
  // Firestore
  'permission-denied':
    '保存が拒否されました。ログインの有効期限が切れたか、データの形式が正しくない可能性があります。',
  unavailable: 'サーバーに接続できません。オンラインになってからもう一度お試しください。',
  'resource-exhausted':
    'サーバーの利用上限に達しました。時間をおいてからもう一度お試しください。',
  // Authentication
  'auth/popup-blocked':
    'ログイン画面がブロックされました。ブラウザでこのサイトのポップアップを許可してください。',
  'auth/network-request-failed': 'ネットワークに接続できません。',
  'auth/unauthorized-domain':
    'このアドレスからのログインは許可されていません。Firebase の「承認済みドメイン」に追加してください。',
  'auth/user-mismatch':
    '別の Google アカウントが選ばれました。ログイン中と同じアカウントを選んでください。',
};

export function describeError(error: unknown): string {
  if (error instanceof FirebaseError && MESSAGES[error.code]) {
    return MESSAGES[error.code];
  }
  return error instanceof Error ? error.message : '不明なエラーが発生しました。';
}

/** ポップアップを閉じただけのときはエラーとして扱わない */
export function isCancelledPopup(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request')
  );
}

/** まとめて書き換える操作は途中で電波が切れると止まって見えるため、始める前に確かめる */
export function assertOnline(): void {
  if (!navigator.onLine) {
    throw new Error('オフラインのため実行できません。インターネットに接続してからもう一度お試しください。');
  }
}
