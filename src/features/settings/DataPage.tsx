import { useEffect, useRef, useState } from 'react';
import {
  clearCacheAndReload,
  hasPendingWrites,
  isRecentlySignedIn,
  reauthenticate,
  signOutAndClearCache,
  usesRedirect,
  useUser,
} from '../../auth/session';
import {
  deleteAccount,
  exportBackup,
  importBackup,
  resetAll,
} from '../../db/operations';
import { describeError, isCancelledPopup } from '../../db/syncStatus';
import { downloadJson } from '../../utils/download';

/**
 * リダイレクト方式の本人確認では画面が読み込み直されるため、
 * 「削除のための本人確認から戻ってきた」ことを sessionStorage に残しておく。
 */
const REAUTH_FOR_DELETE = 'kakeibo.reauthForDelete';

function markReauthForDelete() {
  try {
    sessionStorage.setItem(REAUTH_FOR_DELETE, '1');
  } catch {
    // 保存できなくても、戻ってきたあと「本人確認して削除」をもう一度押せば進められる
  }
}

function consumeReauthForDelete(): boolean {
  try {
    const marked = sessionStorage.getItem(REAUTH_FOR_DELETE) === '1';
    sessionStorage.removeItem(REAUTH_FOR_DELETE);
    return marked;
  } catch {
    return false;
  }
}

type DeleteStep = 'idle' | 'confirm' | 'verified';

export default function DataPage() {
  const user = useUser();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');

  // 本人確認から戻ってきたら、そのまま最後の確認を表示する
  useEffect(() => {
    if (!consumeReauthForDelete()) return;
    isRecentlySignedIn(user).then((recent) => {
      if (recent) setDeleteStep('verified');
    });
  }, [user]);

  /** まとめて読み書きする操作は数秒かかるため、その間は他のボタンを押せないようにする */
  const run = async (task: () => Promise<string | void>) => {
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const result = await task();
      if (result) setMessage(result);
    } catch (e) {
      if (!isCancelledPopup(e)) setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () =>
    run(async () => {
      const data = await exportBackup();
      downloadJson(data, 'kakeibo-backup');
      return `${data.transactions.length}件の取引をエクスポートしました。`;
    });

  const handleImport = (file: File) => {
    if (
      !window.confirm(
        '現在のデータはすべて置き換えられます。取り込みを実行しますか?',
      )
    ) {
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    return run(async () => {
      try {
        await importBackup(await file.text());
        return '取り込みが完了しました。';
      } finally {
        if (fileInput.current) fileInput.current.value = '';
      }
    });
  };

  const handleReset = () => {
    if (
      !window.confirm(
        'すべての取引・カテゴリ・支払い方法・定期支出を削除し、初期状態に戻します。この操作は取り消せません。実行しますか?',
      )
    ) {
      return;
    }
    return run(async () => {
      await resetAll();
      return '初期状態に戻しました。';
    });
  };

  const handleSignOut = () =>
    run(async () => {
      if (
        (await hasPendingWrites()) &&
        !window.confirm(
          'まだサーバーに送信できていない変更があります。いまログアウトすると、その変更は失われます。ログアウトしますか?',
        )
      ) {
        return;
      }
      await signOutAndClearCache();
    });

  // 本人確認のポップアップはクリック直後に開かないとブロックされるため、
  // window.confirm を挟まず、画面上で確認してから押してもらう
  const handleVerify = () =>
    run(async () => {
      if (usesRedirect) markReauthForDelete();
      await reauthenticate(user);
      setDeleteStep('verified');
    });

  const handleDeleteAccount = () =>
    run(async () => {
      try {
        await deleteAccount();
      } catch (e) {
        setDeleteStep('confirm');
        throw e;
      }
      await clearCacheAndReload();
    });

  return (
    <>
      <h1>アカウント・データ</h1>

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
        <h2>アカウント</h2>
        <p>
          <strong>{user.displayName ?? 'ログイン中'}</strong>
          <span className="muted">（{user.email}）</span>
        </p>
        <p className="muted">
          記録はクラウドに保存され、このアカウントでログインしたスマホ・PC の間で同期されます。ログアウトすると、この端末に残した記録のコピーも削除されます。
        </p>
        <button onClick={handleSignOut} disabled={busy}>
          ログアウト
        </button>
      </div>

      <div className="card">
        <h2>エクスポート</h2>
        <p className="muted">
          全データを JSON ファイルとして保存します。手元にバックアップを残したいときや、別のアカウントへ移すときに使います。
        </p>
        <button className="primary" onClick={handleExport} disabled={busy}>
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
          disabled={busy}
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
        <button className="danger" onClick={handleReset} disabled={busy}>
          全データを削除して初期化
        </button>
      </div>

      <div className="card">
        <h2>アカウントの削除</h2>
        <p className="muted">
          クラウド上のすべての記録とアカウントを削除します。確認のため、もう一度 Google
          アカウントを選んで本人確認をしてもらいます。
        </p>
        {deleteStep === 'idle' && (
          <button
            className="danger"
            onClick={() => setDeleteStep('confirm')}
            disabled={busy}
          >
            アカウントを削除
          </button>
        )}
        {deleteStep !== 'idle' && (
          <>
            <p className="expense">
              {deleteStep === 'verified' && '本人確認ができました。'}
              すべての端末から記録が見られなくなり、元に戻せません。必要なら先にエクスポートしてください。
            </p>
            <div className="row">
              {deleteStep === 'confirm' ? (
                <button className="danger" onClick={handleVerify} disabled={busy}>
                  本人確認して削除
                </button>
              ) : (
                <button className="danger" onClick={handleDeleteAccount} disabled={busy}>
                  削除する
                </button>
              )}
              <button onClick={() => setDeleteStep('idle')} disabled={busy}>
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
