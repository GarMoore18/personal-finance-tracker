import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadFile, exportFile, loadExport } from './dataExports';
import type { Dataset, ExportFormat } from './dataExports';
import { localToday } from './financialInputs';

export function DataExportPage({ client }: { client: SupabaseClient }) {
  const [downloading, setDownloading] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const form = new FormData(event.currentTarget);
    const dataset: Dataset = form.get('dataset') === 'accounts' ? 'accounts' : 'expenses';
    const format: ExportFormat = form.get('format') === 'xlsx' ? 'xlsx' : 'csv';
    const controller = new AbortController();
    request.current = controller;
    setDownloading(true);
    setConfirmation('');
    setError('');
    try {
      const data = await loadExport(client, dataset, controller.signal);
      if (!data.rows.length) {
        setConfirmation(dataset === 'accounts' ? 'No accounts to export.' : 'No expenses to export.');
        return;
      }
      const blob = await exportFile(data, format);
      if (controller.signal.aborted) return;
      downloadFile(blob, `ledger-${dataset}-${localToday()}.${format}`);
      setConfirmation('Download ready.');
    } catch {
      if (!controller.signal.aborted) setError('Could not prepare the download. Try again.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return (
    <section className="panel export-panel" aria-label="Download Ledger data">
      <form onSubmit={download}>
        <fieldset className="group-form export-form" disabled={downloading}>
          <label>Data
            <select name="dataset"><option value="expenses">Expenses</option><option value="accounts">Account balances</option></select>
          </label>
          <label>File format
            <select name="format"><option value="csv">CSV</option><option value="xlsx">Excel (.xlsx)</option></select>
          </label>
          <p className="form-help">Downloads contain your financial records. Store them privately.</p>
          <button type="submit">{downloading ? 'Preparing download…' : 'Download'}</button>
        </fieldset>
      </form>
      {confirmation && <p role="status">{confirmation}</p>}
      {error && <p className="notice-error" role="alert">{error}</p>}
    </section>
  );
}
