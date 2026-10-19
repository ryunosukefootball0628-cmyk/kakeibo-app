import { clearSyncError, useOnline, useSyncError } from '../db/syncStatus';

/** オフライン中であることと、あとから届いた保存の失敗を画面上部に出す */
export default function SyncStatus() {
  const online = useOnline();
  const error = useSyncError();

  return (
    <>
      {!online && (
        <div className="status-bar">
          オフラインです。入力した内容はこの端末に一時保存され、接続が戻ると自動で同期されます。
        </div>
      )}
      {error && (
        <div className="status-bar error" role="alert">
          <span>{error}</span>
          <button className="small" onClick={clearSyncError}>
            閉じる
          </button>
        </div>
      )}
    </>
  );
}
