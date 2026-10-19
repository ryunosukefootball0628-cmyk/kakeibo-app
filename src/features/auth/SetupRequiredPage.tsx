/** Firebase の設定が渡されずにビルド・起動されたときの案内 */
export default function SetupRequiredPage() {
  return (
    <div className="login">
      <div className="card login-card">
        <h1>Firebase の設定がありません</h1>
        <p>
          このアプリはデータの保存先に Firebase を使います。README の「Firebase
          の準備」に沿ってプロジェクトを作成し、設定値を <code>.env.local</code>{' '}
          に書いてから起動し直してください。
        </p>
        <p className="muted">
          設定なしで試す場合は、エミュレーターを起動したうえで{' '}
          <code>npm run dev:emulator</code> を使います。
        </p>
      </div>
    </div>
  );
}
