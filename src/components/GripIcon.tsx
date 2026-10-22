/** 行を並べ替えるつまみ (縦 3 × 横 2 の点)。src/hooks/useDragReorder.ts の handleProps を渡したボタンの中に置く */
export default function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      {[3, 8, 13].flatMap((y) =>
        [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
      )}
    </svg>
  );
}
