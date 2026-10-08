import type { CSSProperties } from 'react';

export const tooltipStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
};

export const axisTick = { fill: 'var(--muted)', fontSize: 12 } as const;
