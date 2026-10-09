import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  daysSince,
  dismissNotice,
  getLastExportAt,
  isNoticeDismissed,
} from '../utils/localPrefs';

const BACKUP_REMINDER_DAYS = 30;

interface Props {
  /** 0 件のうちは失うものが無いのでバックアップを促さない */
  transactionCount: number;
}

export default function StorageNotice({ transactionCount }: Props) {
  const [dismissed, setDismissed] = useState(isNoticeDismissed);

  if (!dismissed) {
    return (
      <div className="notice">
        <strong>はじめに — データの保存場所について</strong>
        <p>
          入力した家計データは、この端末のブラウザ内だけに保存されます。サーバーには送信されないため他の人に見られることはありませんが、
          <strong>ブラウザのデータを消去すると復元できません。</strong>
          別の端末とも共有されません。
        </p>
        <p>
          大切な記録は「データ管理」から定期的に JSON ファイルへ書き出しておいてください。
        </p>
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              dismissNotice();
              setDismissed(true);
            }}
          >
            了解しました
          </button>
          <Link to="/settings/data">データ管理を開く</Link>
        </div>
      </div>
    );
  }

  const lastExportAt = getLastExportAt();
  const elapsed = lastExportAt ? daysSince(lastExportAt) : null;
  const needsBackup =
    transactionCount > 0 && (elapsed === null || elapsed >= BACKUP_REMINDER_DAYS);

  if (!needsBackup) return null;

  return (
    <div className="notice">
      <strong>バックアップをおすすめします</strong>
      <p>
        {elapsed === null
          ? 'まだ一度もバックアップを取っていません。'
          : `最後のバックアップから ${elapsed} 日経過しています。`}
        ブラウザのデータを消去すると記録は失われます。
      </p>
      <Link to="/settings/data">
        <button className="primary">バックアップする</button>
      </Link>
    </div>
  );
}
