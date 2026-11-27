import { useState } from 'react';
import { downloadFile, exportFile } from './dataExports';
import type { ReportPoint } from './reports';

export function ReportDownload({ title, filename, points, total, account }: {
  title: string; filename: string; points: ReportPoint[]; total?: bigint; account?: string;
}) {
  const [status, setStatus] = useState('');
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    setStatus('');
    const rows = points.map(({ period, label, cents }) => [title, period, 'USD', account ?? label, 'detail', cents ?? '']);
    if (total !== undefined) rows.push([title, points[0].period, 'USD', 'Total spending', 'total', total]);
    try {
      const blob = await exportFile({
        headers: ['report', 'period', 'currency', 'label', 'row_type', 'amount'],
        rows,
      }, 'csv');
      downloadFile(blob, filename);
      setStatus('Download ready.');
    } catch {
      setStatus('Could not prepare the download. Try again.');
    } finally {
      setDownloading(false);
    }
  }

  return <div className="report-download">
    <button type="button" className="button-secondary" disabled={downloading}
      aria-label={`Download CSV for ${title}`} onClick={() => void download()}>Download CSV</button>
    <span role="status">{status}</span>
  </div>;
}
