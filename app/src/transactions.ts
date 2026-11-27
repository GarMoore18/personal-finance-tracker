import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday } from './financialInputs';
import { toCents } from './money';

export type Transaction = {
  id: string;
  occurred_on: string;
  description: string;
  amount: number;
  category_id: string;
  notes: string | null;
  categories: { name: string } | null;
};
export type DailyTotal = { date: string; total: bigint };
export type Day = DailyTotal & { transactions: Transaction[] };
const transactionColumns = 'id, occurred_on, description, amount, category_id, notes, categories(name)';

export const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});


export function transactionQuery(client: SupabaseClient, columns = transactionColumns) {
  return client.from('transactions').select(columns)
    .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).order('id');
}

export function groupDays(transactions: Transaction[]) {
  const days = new Map<string, Day>();
  for (const transaction of transactions) {
    const date = transaction.occurred_on;
    const day = days.get(date) ?? { date, total: 0n, transactions: [] };
    day.total += toCents(transaction.amount);
    day.transactions.push(transaction);
    days.set(date, day);
  }
  return [...days.values()];
}

async function loadMonthRows<Row>(client: SupabaseClient, month: string, signal: AbortSignal, columns: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = monthNumber === 12
    ? String(year + 1).padStart(4, '0') + '-01'
    : String(year).padStart(4, '0') + '-' + String(monthNumber + 1).padStart(2, '0');
  const rows: Row[] = [];
  const batchSize = 200;
  for (let offset = 0; !signal.aborted; offset += batchSize) {
    const { data, error } = await transactionQuery(client, columns)
      .gte('occurred_on', month + '-01').lt('occurred_on', nextMonth + '-01')
      .range(offset, offset + batchSize - 1).abortSignal(signal)
      .overrideTypes<Row[], { merge: false }>();
    if (signal.aborted || error) return null;
    rows.push(...data);
    if (data.length < batchSize) return rows;
  }
  return null;
}

export async function loadMonth(client: SupabaseClient, month: string, signal: AbortSignal) {
  const rows = await loadMonthRows<Transaction>(client, month, signal, transactionColumns);
  return rows ? groupDays(rows) : null;
}

export async function loadMonthSpending(client: SupabaseClient, month: string, signal: AbortSignal) {
  const rows = await loadMonthRows<Pick<Transaction, 'occurred_on' | 'amount'>>(
    client, month, signal, 'occurred_on,amount',
  );
  if (!rows) return null;
  const byDate = new Map<string, bigint>();
  let total = 0n;
  for (const row of rows) {
    const cents = toCents(row.amount);
    total += cents;
    byDate.set(row.occurred_on, (byDate.get(row.occurred_on) ?? 0n) + cents);
  }
  return {
    count: rows.length,
    total,
    days: Array.from(byDate, ([date, total]) => ({ date, total })),
  };
}

export function currentMonth() {
  return localToday().slice(0, 7);
}
