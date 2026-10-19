import { useState } from 'react';
import { signInWithGoogle } from '../../auth/session';
import { describeError, isCancelledPopup } from '../../db/syncStatus';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ポップアップがブロックされないよう、クリックから直接ログインを始める
  const handleSignIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      if (!isCancelledPopup(e)) setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

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
        {error && <p className="expense">{error}</p>}

        <ul className="login-notes muted">
          <li>
            記録はクラウド（Google の Firebase）に保存され、同じアカウントでログインしたスマホ・PC の間で同期されます。
          </li>
          <li>電波のない場所でも入力でき、つながったときに自動で送信されます。</li>
          <li>
            他の利用者があなたの記録を見ることはできません。なお、保存先のデータベースはこのアプリの管理者が管理しており、管理者は技術的には保存された記録を閲覧できる立場にあります。
          </li>
        </ul>
      </div>
    </div>
  );
}
