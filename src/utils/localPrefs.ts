/**
 * 端末ごとの表示設定。家計データ本体ではないため IndexedDB ではなく localStorage を使う。
 * プライベートブラウズでは読み書きが例外を投げうるので、失敗しても動作を止めない。
 */

const NOTICE_DISMISSED = 'kakeibo.noticeDismissed';
const LAST_EXPORT_AT = 'kakeibo.lastExportAt';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても案内が毎回出るだけで実害はない
  }
}

export const isNoticeDismissed = () => read(NOTICE_DISMISSED) === '1';

export const dismissNotice = () => write(NOTICE_DISMISSED, '1');

export const getLastExportAt = () => read(LAST_EXPORT_AT);

export const recordExport = () => write(LAST_EXPORT_AT, new Date().toISOString());

export function daysSince(isoDateTime: string): number {
  const elapsed = Date.now() - new Date(isoDateTime).getTime();
  return Math.floor(elapsed / (1000 * 60 * 60 * 24));
}
