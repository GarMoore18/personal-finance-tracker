import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday } from './financialInputs';
import { toCents } from './money';

export type Transaction = {
  id: string;
  occurred_on: string;
  description: string;
  amount: number;
  categories: { name: string } | null;
};
export type Day = { date: string; total: bigint; transactions: Transaction[] };

export const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});


export function transactionQuery(client: SupabaseClient) {
  return client.from('transactions').select('id, occurred_on, description, amount, categories(name)')
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

export async function loadMonth(client: SupabaseClient, month: string, signal: AbortSignal) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = monthNumber === 12
    ? String(year + 1).padStart(4, '0') + '-01'
    : String(year).padStart(4, '0') + '-' + String(monthNumber + 1).padStart(2, '0');
  const rows: Transaction[] = [];
  const batchSize = 200;
  for (let offset = 0; !signal.aborted; offset += batchSize) {
    const { data, error } = await transactionQuery(client)
      .gte('occurred_on', month + '-01').lt('occurred_on', nextMonth + '-01')
      .range(offset, offset + batchSize - 1).abortSignal(signal)
      .overrideTypes<Transaction[], { merge: false }>();
    if (signal.aborted || error) return null;
    rows.push(...data);
    if (data.length < batchSize) return groupDays(rows);
  }
  return null;
}

export function currentMonth() {
  return localToday().slice(0, 7);
}
