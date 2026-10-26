import { Link, Outlet } from 'react-router-dom';
import { useFeatures } from '../hooks/useFeatures';
import { OPTIONAL_FEATURES, type FeatureId } from '../optionalFeatures';

/**
 * 「使う機能」でオフにした機能の画面を、ブックマークや履歴から開いたときは、
 * 画面の代わりにオンにする方法を案内する
 */
export default function FeatureGate({ feature }: { feature: FeatureId }) {
  const features = useFeatures();
  if (features.loading) return <p className="loading">読み込み中…</p>;
  if (features.isEnabled(feature)) return <Outlet />;

  const label = OPTIONAL_FEATURES.find((f) => f.id === feature)?.label;
  return (
    <>
      <h1>{label}</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          「{label}」はオフになっています。「使う機能」でオンにすると、この画面を使えます。
        </p>
        <Link to="/settings/features">
          <button className="primary">使う機能へ</button>
        </Link>
      </div>
    </>
  );
}
