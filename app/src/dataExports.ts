import type { SupabaseClient } from '@supabase/supabase-js';
import { toCents } from './money';

export type Dataset = 'expenses' | 'accounts';
export type ExportFormat = 'csv' | 'xlsx';
type Cell = string | bigint;
type Table = { headers: string[]; rows: Cell[][] };
type Expense = { occurred_on: string; description: string; amount: number | string; notes: string | null; categories: { name: string } | null };
type Account = {
  name: string;
  kind: string;
  current_balance: number | string;
  balance_observed_on: string;
  archived_at: string | null;
  account_groups: { name: string } | null;
};

async function loadRows<T>(
  client: SupabaseClient, table: string, columns: string, orderBy: string, signal: AbortSignal,
) {
  const rows: T[] = [];
  const pageSize = 200;
  for (let offset = 0; !signal.aborted; offset += pageSize) {
    const { data, error } = await client.from(table).select(columns).order(orderBy).order('id')
      .range(offset, offset + pageSize - 1).abortSignal(signal).overrideTypes<T[], { merge: false }>();
    if (error || signal.aborted) throw new Error('Could not read export rows');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
  throw new Error('Export cancelled');
}

export async function loadExport(client: SupabaseClient, dataset: Dataset, signal: AbortSignal): Promise<Table> {
  if (dataset === 'expenses') {
    const rows = await loadRows<Expense>(
      client, 'transactions', 'occurred_on,amount,description,notes,categories(name)', 'occurred_on', signal,
    );
    return {
      headers: ['date', 'amount', 'description', 'category', 'notes'],
      rows: rows.map(({ occurred_on, amount, description, categories, notes }) =>
        [occurred_on, toCents(amount), description, categories?.name ?? '', notes ?? '']),
    };
  }
  const rows = await loadRows<Account>(
    client, 'accounts', 'name,kind,current_balance,balance_observed_on,archived_at,account_groups(name)', 'name', signal,
  );
  return {
    headers: ['name', 'classification', 'balance_usd', 'observed_on', 'group', 'status'],
    rows: rows.map(({ name, kind, current_balance, balance_observed_on, account_groups, archived_at }) =>
      [name, kind, toCents(current_balance), balance_observed_on, account_groups?.name ?? '', archived_at ? 'archived' : 'active']),
  };
}

function csvCell(cell: Cell) {
  if (typeof cell === 'bigint') {
    const magnitude = cell < 0n ? -cell : cell;
    return (cell < 0n ? '-' : '') + String(magnitude / 100n) + '.' + String(magnitude % 100n).padStart(2, '0');
  }
  // Spreadsheet applications can evaluate formula-like text even inside CSV quotes.
  const text = /^[\s\uFEFF]*[=+@＝＋－＠-]|^[\t\r\n]/.test(cell) ? "'" + cell : cell;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function exportFile(table: Table, format: ExportFormat): Promise<Blob> {
  if (format === 'csv') {
    const lines = [table.headers, ...table.rows].map((row) => row.map(csvCell).join(','));
    return new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' });
  }
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  return writeExcelFile([
    table.headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
    ...table.rows.map((row) => row.map((cell) => typeof cell === 'bigint'
      ? { value: Number(cell) / 100, type: Number, format: '0.00' }
      : { value: cell, type: String })),
  ]).toBlob();
}

export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
