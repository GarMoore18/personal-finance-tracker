import type { SupabaseClient } from '@supabase/supabase-js';
import { toCents } from './money';
import { currentMonth } from './transactions';

export type ReportPoint = { period: string; label: string; cents: bigint | null };
type CategoryTotal = { name: string; cents: bigint };
type Expense = { occurred_on: string; amount: number | string; category_id: string; categories: { name: string } | null };
type Account = { id: string; name: string; kind: 'asset' | 'liability'; archived_at: string | null };
type Snapshot = { account_id: string; month: string; balance: number | string };
type Page<Row> = { data: Row[]; error: null } | { data: null; error: unknown };

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });

function shiftMonth(month: string, offset: number) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function reportMonths() {
  const month = currentMonth();
  return Array.from({ length: 12 }, (_, index) => shiftMonth(month, index - 11));
}

export function reportMonthLabel(month: string) {
  return monthFormatter.format(new Date(month + '-01T00:00:00Z'));
}

async function readPages<Row>(signal: AbortSignal, query: (from: number, to: number) => PromiseLike<Page<Row>>) {
  const rows: Row[] = [];
  const pageSize = 200;
  for (let offset = 0; !signal.aborted; offset += pageSize) {
    const { data } = await query(offset, offset + pageSize - 1);
    if (!data || signal.aborted) break;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
  throw new Error('Could not read report data');
}

export async function loadSpendingReport(client: SupabaseClient, months: string[], signal: AbortSignal) {
  const expenses = await readPages<Expense>(signal, (from, to) => client.from('transactions')
    .select('occurred_on,amount,category_id,categories(name)')
    .gte('occurred_on', months[0] + '-01').lt('occurred_on', shiftMonth(months[months.length - 1], 1) + '-01')
    .order('occurred_on', { ascending: false }).order('id').range(from, to).abortSignal(signal)
    .overrideTypes<Expense[], { merge: false }>());

  const byMonth = new Map<string, Map<string, CategoryTotal>>();
  for (const expense of expenses) {
    const month = expense.occurred_on.slice(0, 7);
    const categories = byMonth.get(month) ?? new Map<string, CategoryTotal>();
    const previous = categories.get(expense.category_id);
    categories.set(expense.category_id, {
      name: expense.categories?.name ?? 'Category unavailable',
      cents: (previous?.cents ?? 0n) + toCents(expense.amount),
    });
    byMonth.set(month, categories);
  }
  return byMonth;
}

export async function loadBalancesReport(client: SupabaseClient, months: string[], signal: AbortSignal) {
  const [accounts, snapshots] = await Promise.all([
    readPages<Account>(signal, (from, to) => client.from('accounts').select('id,name,kind,archived_at')
      .order('id').range(from, to).abortSignal(signal).overrideTypes<Account[], { merge: false }>()),
    readPages<Snapshot>(signal, (from, to) => client.from('balance_snapshots').select('account_id,month,balance')
      .lte('month', months[months.length - 1] + '-01').order('account_id').order('month')
      .range(from, to).abortSignal(signal).overrideTypes<Snapshot[], { merge: false }>()),
  ]);
  const histories = new Map<string, Map<string, bigint>>();
  const totals = new Map<string, bigint>();
  for (const { id } of accounts) histories.set(id, new Map());
  for (const { account_id, month, balance } of snapshots) {
    histories.get(account_id)?.set(month.slice(0, 7), toCents(balance));
  }

  for (const { id, kind, archived_at } of accounts) {
    // Rows are ordered by month within each account. Observations before the
    // report period supply the opening balance until the next observation.
    const observations = [...histories.get(id)!];
    const archivedMonth = archived_at?.slice(0, 7);
    let index = 0;
    let latest: bigint | undefined;
    for (const month of months) {
      if (archivedMonth && month >= archivedMonth) break;
      while (index < observations.length && observations[index][0] <= month) {
        latest = observations[index][1];
        index += 1;
      }
      if (latest !== undefined) {
        totals.set(month, (totals.get(month) ?? 0n) + (kind === 'asset' ? latest : -latest));
      }
    }
  }
  return { accounts: accounts.sort((a, b) => a.name.localeCompare(b.name)), histories, totals };
}

export type SpendingReport = Awaited<ReturnType<typeof loadSpendingReport>>;
export type BalancesReport = Awaited<ReturnType<typeof loadBalancesReport>>;

export function spendingByCategory(report: SpendingReport, month: string): ReportPoint[] {
  const categories = [...(report.get(month)?.values() ?? [])];
  return categories.sort((a, b) => a.cents === b.cents
    ? a.name.localeCompare(b.name) : a.cents > b.cents ? -1 : 1)
    .map(({ name, cents }) => ({ period: month, label: name, cents }));
}

export function spendingTrend(report: SpendingReport, months: string[]): ReportPoint[] {
  return months.map((month) => ({
    period: month,
    label: reportMonthLabel(month),
    cents: [...(report.get(month)?.values() ?? [])].reduce((total, category) => total + category.cents, 0n),
  }));
}

export function balanceTrend(history: Map<string, bigint> | undefined, months: string[]): ReportPoint[] {
  return months.map((month) => ({ period: month, label: reportMonthLabel(month), cents: history?.get(month) ?? null }));
}
