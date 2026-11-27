import type { CellValue } from 'read-excel-file/browser';
import type { ImportSource } from './expenseImport';

export type Worksheet = { name: string; source?: ImportSource };

function cellText(value: CellValue<string> | null) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().split('T')[0] : '';
  }
  return value === null || typeof value === 'boolean' ? '' : value;
}

export async function readExcel(file: File): Promise<Worksheet[] | string> {
  if (file.size > 5 * 1024 * 1024) return 'Choose an Excel workbook of 5 MB or less.';

  const { default: readWorkbook } = await import('read-excel-file/browser');
  const sheets = await readWorkbook(file, { parseNumber: (value) => value });
  const worksheets = sheets.map(({ sheet: name, data }): Worksheet => {
    const [firstRow, ...dataRows] = data ?? [];
    const header = firstRow?.map(cellText);
    if (!header?.some((cell) => cell.trim())) return { name };
    const rows = dataRows.flatMap((cells, index) => cells.some((cell) => cell !== null)
      ? [{ id: crypto.randomUUID(), number: index + 2, cells: cells.map(cellText) }] : []);
    return { name, source: rows.length ? { header, rows } : undefined };
  });
  return worksheets.some(({ source }) => source) ? worksheets : 'Choose a workbook with a header row and at least one expense.';
}
