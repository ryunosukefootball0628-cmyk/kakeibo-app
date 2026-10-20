import { useState } from 'react';
import { signInWithGoogle } from '../../auth/session';
import {
  clearSyncError,
  describeError,
  isCancelledPopup,
  useSyncError,
} from '../../db/syncStatus';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Google の画面から戻ってきたときの失敗 (リダイレクト方式) はこちらに届く
  const redirectError = useSyncError();

  // ポップアップがブロックされないよう、クリックから直接ログインを始める
  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    clearSyncError();
    try {
      await signInWithGoogle();
    } catch (e) {
      if (!isCancelledPopup(e)) setError(describeError(e));
    } finally {
      // リダイレクト方式では成功すると Google の画面へ移動するのでここには来ない。
      // 来るのは移動前に失敗したときなので、もう一度押せるよう戻す
      setBusy(false);
    }
  };

  const shownError = error || redirectError;

  return (
    <div className="login">
      <div className="card login-card">
        <img
          className="login-icon"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          width={64}
          height={64}
        />
        <h1>家計簿</h1>
        <p>
          日々の収支を記録して、カテゴリ別・支払い方法別に集計できる家計簿です。
        </p>

        <button className="primary login-button" onClick={handleSignIn} disabled={busy}>
          {busy ? 'ログイン中…' : 'Google でログイン'}
        </button>
        {shownError && <p className="expense">{shownError}</p>}

        <ul className="login-notes muted">
          <li>
            記録はクラウド（Google の Firebase）に保存され、同じアカウントでログインしたスマホ・PC の間で同期されます。
          </li>
          <li>電波のない場所でも入力でき、つながったときに自動で送信されます。</li>
          <li>
            他の利用者があなたの記録を見ることはできません。なお、保存先のデータベースはこのアプリの管理者が管理しており、管理者は技術的には保存された記録を閲覧できる立場にあります。
          </li>
          <li>
            LINE などのアプリ内で開いた画面では Google のログインが使えません。Safari や Chrome で開いてください。
          </li>
        </ul>
      </div>
    </div>
  );
}
