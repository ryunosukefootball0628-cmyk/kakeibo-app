import { todayIso } from './date';

/** データを JSON ファイルとしてダウンロードさせる */
export function downloadJson(data: unknown, prefix: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
