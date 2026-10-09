import { useRef, useState } from 'react';
import { exportBackup, importBackup, resetAll } from '../../db/operations';
import { todayIso } from '../../utils/date';
import { daysSince, getLastExportAt, recordExport } from '../../utils/localPrefs';

export default function DataPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastExportAt, setLastExportAt] = useState(getLastExportAt);

  const handleExport = async () => {
    setError('');
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kakeibo-backup-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    recordExport();
    setLastExportAt(getLastExportAt());
    setMessage(`${data.transactions.length}件の取引をエクスポートしました。`);
  };

  const handleImport = async (file: File) => {
    setMessage('');
    setError('');
    if (
      !window.confirm(
        '現在のデータはすべて置き換えられます。取り込みを実行しますか?',
      )
    ) {
      return;
    }
    try {
      await importBackup(await file.text());
      setMessage('取り込みが完了しました。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました。');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleReset = async () => {
    setMessage('');
    setError('');
    if (
      !window.confirm(
        'すべての取引・カテゴリ・支払い方法・定期支出を削除し、初期状態に戻します。この操作は取り消せません。実行しますか?',
      )
    ) {
      return;
    }
    await resetAll();
    setMessage('初期状態に戻しました。');
  };

  return (
    <>
      <h1>データ管理</h1>

      <div className="card">
        <p className="muted">
          このアプリのデータはブラウザ内（IndexedDB）にのみ保存されます。ブラウザのデータを消去すると失われるため、定期的にエクスポートして保管してください。
        </p>
      </div>

      {message && (
        <div className="card">
          <span className="income">{message}</span>
        </div>
      )}
      {error && (
        <div className="card">
          <span className="expense">{error}</span>
        </div>
      )}

      <div className="card">
        <h2>エクスポート</h2>
        <p className="muted">
          全データを JSON ファイルとして保存します。
          {lastExportAt
            ? `最後のバックアップ: ${lastExportAt.slice(0, 10)}（${daysSince(lastExportAt)}日前）`
            : 'まだ一度もバックアップを取っていません。'}
        </p>
        <button className="primary" onClick={handleExport}>
          JSON をダウンロード
        </button>
      </div>

      <div className="card">
        <h2>インポート</h2>
        <p className="muted">
          エクスポートした JSON を読み込みます。現在のデータはすべて置き換えられます。
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
        />
      </div>

      <div className="card">
        <h2>初期化</h2>
        <p className="muted">
          すべてのデータを削除し、カテゴリと支払い方法を初期状態に戻します。
        </p>
        <button className="danger" onClick={handleReset}>
          全データを削除して初期化
        </button>
      </div>
    </>
  );
}
