import { setFeatureEnabled } from '../../db/operations';
import { useFeatures } from '../../hooks/useFeatures';
import { OPTIONAL_FEATURES } from '../../optionalFeatures';

export default function FeaturesPage() {
  const features = useFeatures();

  return (
    <>
      <h1>使う機能</h1>
      <p className="muted">
        使わない機能をオフにすると、メニューのほか、ダッシュボードや口座残高の見込みにも出なくなります。オフにしても記録は消えず、オンに戻すと元どおり表示されます。設定は、同じアカウントでログインした端末で共通です。
      </p>

      <div className="card">
        {features.loading ? (
          <p className="loading">読み込み中…</p>
        ) : (
          OPTIONAL_FEATURES.map((feature) => (
            <label key={feature.id} className="choice">
              <input
                type="checkbox"
                checked={features.isEnabled(feature.id)}
                onChange={(e) => setFeatureEnabled(feature.id, e.target.checked)}
              />
              <span>
                {feature.label}
                <span className="muted" style={{ display: 'block' }}>
                  {feature.description}
                </span>
              </span>
            </label>
          ))
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          ダッシュボード・取引一覧・カテゴリ設定・支払い方法設定・アカウント・データは、いつも使えます。
        </p>
      </div>
    </>
  );
}
