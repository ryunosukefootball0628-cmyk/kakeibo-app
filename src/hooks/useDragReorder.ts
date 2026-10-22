import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

interface Drag<T> {
  pointerId: number;
  /** つかんだときの並び */
  items: T[];
  /** つかんだ行の位置と、いま落とすと入る位置 */
  from: number;
  to: number;
  /** つかんだ行を動かした量 (px) */
  dy: number;
  startY: number;
  /** つかんだときの各行の上端 (ページ上の位置) と高さ */
  tops: number[];
  heights: number[];
}

/** list の from 番目を to 番目へ移した新しい配列 */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** スクロールしても位置がずれないよう、ページ上の座標で扱う */
const pageY = (event: PointerEvent) => event.clientY + window.scrollY;

const register =
  (map: Map<string, HTMLElement>, id: string) => (el: HTMLElement | null) => {
    if (el) map.set(id, el);
    else map.delete(id);
  };

/**
 * 表の行を並べ替える。行のつまみをドラッグ (マウス・タッチ) するか、つまみにフォーカスして ↑↓ キーで動かす。
 * HTML5 の drag and drop はスマホのタッチで動かないことが多いため、Pointer Events で扱う。
 * ドラッグ中は行を transform でずらして見せるだけにし、離したときに新しい並びを onReorder へ渡す。
 */
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (ordered: T[]) => void,
) {
  const rows = useRef(new Map<string, HTMLElement>());
  const handles = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag<T> | null>(null);
  // 書き込みが items に返ってくるまでの一瞬に元の並びが見えないよう、並べ替えた直後の並びを出しておく。
  // そのあいだは次の並べ替えを受け付けない。続けて書くと途中の書き込みの結果が items に返ってきた
  // 時点で表示が一つ前の並びに戻り、それをもとに次の並べ替えを計算してしまうため
  const [pending, setPending] = useState<T[] | null>(null);
  const refocusId = useRef<string | null>(null);

  useEffect(() => setPending(null), [items]);

  // キーボードで動かすと行の付け替えでフォーカスが外れることがあるため、動かした行のつまみに戻す
  useLayoutEffect(() => {
    const id = refocusId.current;
    refocusId.current = null;
    if (id) handles.current.get(id)?.focus();
  });

  const shown = drag?.items ?? pending ?? items;

  const commit = (next: T[]) => {
    setPending(next);
    onReorder(next);
  };

  /** ポインターの位置から、つかんだ行を動かす量と落とす位置を求める */
  const measure = (d: Drag<T>, event: PointerEvent) => {
    const { from, tops, heights } = d;
    const last = tops.length - 1;
    // 表の上端・下端より外へは出さない
    const dy = Math.min(
      Math.max(pageY(event) - d.startY, tops[0] - tops[from]),
      tops[last] + heights[last] - (tops[from] + heights[from]),
    );
    // つかんだ行が隣の行の半分を越えて重なるたびに、落とす位置を 1 つずらす
    // (中心どうしで比べると、端まで動かしても端の行の中心と並ぶだけで越えられない)
    const top = tops[from] + dy;
    const bottom = top + heights[from];
    const middle = (i: number) => tops[i] + heights[i] / 2;
    let to = from;
    while (to < last && bottom > middle(to + 1)) to++;
    while (to > 0 && top < middle(to - 1)) to--;
    return { dy, to };
  };

  const onPointerDown = (index: number) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || pending || shown.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rects = shown.map((item) =>
      rows.current.get(item.id)!.getBoundingClientRect(),
    );
    setDrag({
      pointerId: event.pointerId,
      items: shown,
      from: index,
      to: index,
      dy: 0,
      startY: pageY(event),
      tops: rects.map((rect) => rect.top + window.scrollY),
      heights: rects.map((rect) => rect.height),
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag({ ...drag, ...measure(drag, event) });
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    const { to } = measure(drag, event);
    if (to !== drag.from) commit(moveItem(drag.items, drag.from, to));
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const to = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (drag || pending || to < 0 || to >= shown.length) return;
    refocusId.current = shown[index].id;
    commit(moveItem(shown, index, to));
  };

  /** つかんだ行はポインターに付いていき、落とす位置までの行はつかんだ行の高さぶん詰める */
  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, to, dy, heights } = drag;
    const offset =
      index === from
        ? dy
        : from < index && index <= to
          ? -heights[from]
          : to <= index && index < from
            ? heights[from]
            : 0;
    return offset ? { transform: `translateY(${offset}px)` } : undefined;
  };

  return {
    items: shown,
    dragging: drag !== null,
    rowProps: (item: T, index: number) => ({
      ref: register(rows.current, item.id),
      className: drag?.from === index ? 'dragging' : undefined,
      style: rowStyle(index),
    }),
    handleProps: (item: T, index: number) => ({
      ref: register(handles.current, item.id),
      onPointerDown: onPointerDown(index),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown: onKeyDown(index),
    }),
  };
}
