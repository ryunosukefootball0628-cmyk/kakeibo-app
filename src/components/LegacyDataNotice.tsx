import { useEffect, useState } from 'react';
import { mergeIntoCloud } from '../db/operations';
import { describeError } from '../db/syncStatus';
import type { BackupData } from '../types';
import { downloadJson } from '../utils/download';

// 旧データの読み取りにだけ使う Dexie は、初回表示を重くしないよう後から読み込む
const loadLegacyDb = () => import('../db/legacyDb');

/**
 * クラウド同期に対応する前に、この端末だけに保存していた記録が残っていれば
 * クラウドへの取り込みを案内する。
 */
export default function LegacyDataNotice() {
  const [legacy, setLegacy] = useState<BackupData | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadLegacyDb()
      .then((m) => m.readLegacyData())
      .then((data) => active && setLegacy(data))
      .catch(() => active && setLegacy(null));
    return () => {
      active = false;
    };
  }, []);

  if (done) {
    return (
      <div className="notice">
        <strong>以前の記録をクラウドに取り込みました</strong>
        <p>同じアカウントでログインした他の端末からも見られます。</p>
      </div>
    );
  }

  if (!legacy) return null;

  const handleImport = async () => {
    setBusy(true);
    setError('');
    try {
      await mergeIntoCloud(legacy);
      // サーバーへの書き込みが確定してから端末側を消す
      await (await loadLegacyDb()).deleteLegacyData();
      setDone(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (
      !window.confirm(
        'この端末に残っている以前の記録を削除します。クラウドのデータには影響しません。この操作は取り消せません。削除しますか?',
      )
    ) {
      return;
    }
    await (await loadLegacyDb()).deleteLegacyData();
    setLegacy(null);
  };

  return (
    <div className="notice">
      <strong>この端末に以前の記録が残っています</strong>
      <p>
        クラウド同期に対応する前に、この端末だけに保存していた記録があります（取引{' '}
        {legacy.transactions.length} 件・定期支出 {legacy.recurringExpenses.length}{' '}
        件）。クラウドに取り込むと、他の端末からも見られるようになります。
      </p>
      <p className="muted">
        クラウドにある記録は消えません。同じ記録がすでに取り込まれている場合は重複せず、この端末の内容で上書きされます。
      </p>
      <div className="row">
        <button className="primary" onClick={handleImport} disabled={busy}>
          {busy ? '取り込み中…' : 'クラウドに取り込む'}
        </button>
        <button onClick={() => downloadJson(legacy, 'kakeibo-local-backup')} disabled={busy}>
          JSON で保存
        </button>
        <button className="danger" onClick={handleDiscard} disabled={busy}>
          取り込まずに削除
        </button>
      </div>
      {error && <p className="expense">{error}</p>}
    </div>
  );
}
