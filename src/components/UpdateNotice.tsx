import type { User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '../auth/session';
import { UPDATE_NOTES, type UpdateNote } from '../updateNotes';
import { addDays, dateLabel, formatIsoDate, todayIso } from '../utils/date';

/** この端末で最後に見たお知らせの id */
const LAST_SEEN_KEY = 'kakeibo.lastSeenUpdate';

/** 新しい端末で開いたときなどに、昔のお知らせまでまとめて出さない */
const SHOW_WITHIN_DAYS = 90;

function unseenNotes(user: User): UpdateNote[] {
  let lastSeen: number;
  try {
    lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0);
  } catch {
    // 見たことを覚えておけない環境では、開くたびに出てしまうので出さない
    return [];
  }
  // アカウントを作る前の変更は、初めから今の形で使っているので知らせない
  const created = user.metadata.creationTime;
  const since = created ? formatIsoDate(new Date(created)) : '';
  const cutoff = addDays(todayIso(), -SHOW_WITHIN_DAYS);
  return UPDATE_NOTES.filter(
    (note) => note.id > lastSeen && note.date >= since && note.date >= cutoff,
  );
}

function markAllSeen() {
  try {
    localStorage.setItem(
      LAST_SEEN_KEY,
      String(Math.max(...UPDATE_NOTES.map((note) => note.id))),
    );
  } catch {
    // 保存できなければ次回も表示されるだけ
  }
}

/** 前回開いたあとに変わった点を、ログイン後にポップアップで知らせる */
export default function UpdateNotice() {
  const user = useUser();
  const [notes] = useState(() => unseenNotes(user));
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // 開発時の StrictMode では 2 回呼ばれるので、開いていれば何もしない
    if (notes.length > 0 && !dialog.current?.open) dialog.current?.showModal();
  }, [notes]);

  if (notes.length === 0) return null;

  return (
    <dialog
      ref={dialog}
      className="update-dialog"
      aria-labelledby="update-dialog-title"
      // Esc キーで閉じたときもここを通る
      onClose={markAllSeen}
      // 中身は内側の div が受けるので、dialog 自身に届くのは外側の暗い部分を押したときだけ
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="update-dialog-body">
        <h2 id="update-dialog-title">アプリが新しくなりました</h2>
        {notes.map((note) => (
          <section key={note.id}>
            <h3 className="muted">{dateLabel(note.date)}</h3>
            <ul>
              {note.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="update-dialog-actions">
          <button className="primary" onClick={() => dialog.current?.close()}>
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}
