import { normalizeUsdAmount } from './financialInputs';

export const fields = [
  { id: 'date', label: 'Date', aliases: ['date', 'occurred_on'] },
  { id: 'amount', label: 'Amount (USD)', aliases: ['amount'] },
  { id: 'description', label: 'Description', aliases: ['description', 'merchant'] },
  { id: 'category', label: 'Category', aliases: ['category'] },
  { id: 'notes', label: 'Notes (optional)', aliases: ['notes'] },
] as const;

type Field = (typeof fields)[number]['id'];
export type Mapping = Record<Field, number>;
export type Category = { id: string; name: string };
export type ImportSource = { header: string[]; rows: { id: string; number: number; cells: string[] }[] };
type Expense = { id: string; occurred_on: string; amount: string; description: string; category_id: string; notes: string | null };
export type ReviewValues = { date: string; amount: string; description: string; categoryId: string; notes: string };
export type ReviewedRow = ReviewValues & { id: string; number: number; category: string }
  & ({ expense: Expense; problem?: never } | { expense?: never; problem: string });

export async function readCsv(file: File): Promise<ImportSource | string> {
  const { default: papa } = await import('papaparse');
  const input = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  const { data, errors } = papa.parse<string[]>(input, { delimiter: ',', skipEmptyLines: 'greedy' });
  if (errors.length) {
    const record = errors[0].row;
    const location = record === undefined ? '' : ` near CSV record ${record + 1}`;
    return `Could not read the CSV${location}. Check its quotation marks and try again.`;
  }
  const [header, ...rows] = data;
  if (!header || !rows.length) return 'Choose a CSV with a header and at least one expense.';
  return { header, rows: rows.map((cells, index) => ({ id: crypto.randomUUID(), number: index + 2, cells })) };
}

export function defaultMapping(header: string[]): Mapping {
  const names = header.map((name) => name.trim().toLowerCase());
  return Object.fromEntries(fields.map(({ id, aliases }) => [
    id, names.findIndex((name) => aliases.some((alias) => alias === name)),
  ])) as Mapping;
}

export function mappingProblem(mapping: Mapping) {
  const columns = [mapping.date, mapping.amount, mapping.description, mapping.category];
  if (columns.some((column) => column < 0)) return 'Choose a column for each required field.';
  if (mapping.notes >= 0) columns.push(mapping.notes);
  if (new Set(columns).size !== columns.length) return 'Choose a different column for each field.';
  return '';
}

export function reviewExpenses(
  source: ImportSource, mapping: Mapping, categories: Category[], corrections: ReadonlyMap<string, ReviewValues>,
): ReviewedRow[] {
  const categoryByName = new Map<string, string | null>();
  const categoryById = new Map<string, string>();
  for (const category of categories) {
    const key = category.name.trim().toLowerCase();
    categoryByName.set(key, categoryByName.has(key) ? null : category.id);
    categoryById.set(category.id, category.name);
  }
  return source.rows.map(({ id, number, cells }) => {
    const corrected = corrections.get(id);
    const date = (corrected?.date ?? cells[mapping.date] ?? '').trim();
    const amount = (corrected?.amount ?? cells[mapping.amount] ?? '').trim();
    const description = (corrected?.description ?? cells[mapping.description] ?? '').trim();
    const notes = (corrected?.notes ?? cells[mapping.notes] ?? '').trim();
    const originalCategory = cells[mapping.category]?.trim() ?? '';
    const categoryId = corrected ? corrected.categoryId : categoryByName.get(originalCategory.toLowerCase());
    const category = corrected ? categoryById.get(corrected.categoryId) ?? '' : originalCategory;
    const normalized = normalizeUsdAmount(amount.startsWith('.') ? '0' + amount : amount);
    const row = { id, number, date, amount, description, category, categoryId: categoryId ?? '', notes };

    if (!corrected && cells.length !== source.header.length) return { ...row, problem: 'The number of columns differs from the header.' };
    if (!validDate(date)) return { ...row, problem: 'Use a valid date in YYYY-MM-DD format.' };
    if (!normalized || normalized.startsWith('-') || normalized === '0.00') {
      return { ...row, problem: 'Use a positive USD amount with up to two decimal places.' };
    }
    if (!description) return { ...row, problem: 'Enter an expense description.' };
    if (!categoryId || !categoryById.has(categoryId)) {
      return { ...row, problem: categoryId === null ? 'More than one category has this name. Choose one while editing.' : 'Choose an existing category.' };
    }
    return {
      ...row,
      expense: { id, occurred_on: date, amount: normalized, description, category_id: categoryId, notes: notes || null },
    };
  });
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
