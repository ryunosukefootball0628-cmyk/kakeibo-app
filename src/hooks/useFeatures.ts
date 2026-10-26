import { onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { profileRef } from '../db/collections';
import { reportSyncError } from '../db/syncStatus';
import { isFeatureId, type FeatureId } from '../optionalFeatures';

export interface Features {
  /** 設定の最初の結果がまだ届いていない */
  loading: boolean;
  /**
   * その機能を使うか。設定が届くまでは false にし、オフにした機能のデータを読みにいったり
   * 表示したりしないようにする
   */
  isEnabled: (id: FeatureId) => boolean;
}

/**
 * ログイン中の利用者の、使う機能の設定 (users/{uid} の disabledFeatures) を購読する。
 * 画面を移るたびに読み直さないよう AuthGate で 1 回だけ使い、FeaturesProvider で配る。
 * uid が undefined (未ログイン) のあいだは読まない
 */
export function useFeatureSettings(uid: string | undefined): Features {
  const [result, setResult] = useState<{ uid: string; disabled: FeatureId[] }>();

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      profileRef(uid),
      (snapshot) => {
        const stored: unknown = snapshot.get('disabledFeatures');
        // 新しい版で足した機能など、知らない id は無視する
        setResult({ uid, disabled: Array.isArray(stored) ? stored.filter(isFeatureId) : [] });
      },
      (error) => {
        reportSyncError(error);
        // 読めなくても画面は開けるよう、すべて使う扱いにする
        setResult({ uid, disabled: [] });
      },
    );
  }, [uid]);

  return useMemo(() => {
    const disabled = result && result.uid === uid ? result.disabled : null;
    return {
      loading: disabled === null,
      isEnabled: (id) => disabled !== null && !disabled.includes(id),
    };
  }, [result, uid]);
}

const FeaturesContext = createContext<Features | null>(null);

export const FeaturesProvider = FeaturesContext.Provider;

/** ログイン後の画面でのみ使う */
export function useFeatures(): Features {
  const features = useContext(FeaturesContext);
  if (!features) throw new Error('useFeatures はログイン後の画面でのみ使えます。');
  return features;
}
