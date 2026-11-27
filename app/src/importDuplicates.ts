import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReviewedRow } from './csvImport';
import { normalizeUsdAmount } from './financialInputs';

type ExpenseMatch = { occurred_on: string; amount: string | number; description: string };

function fingerprint({ occurred_on, amount, description }: ExpenseMatch) {
  const normalized = normalizeUsdAmount(String(amount));
  return JSON.stringify([occurred_on, normalized, description.trim().replace(/\s+/g, ' ').toLowerCase()]);
}

export async function loadSavedMatches(client: SupabaseClient, dates: string[], signal: AbortSignal) {
  const matches = new Set<string>();
  const datesPerQuery = 50;
  const pageSize = 200;
  for (let start = 0; start < dates.length; start += datesPerQuery) {
    const batch = dates.slice(start, start + datesPerQuery);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await client.from('transactions').select('occurred_on,amount,description')
        .in('occurred_on', batch).order('occurred_on', { ascending: false }).order('id')
        .range(offset, offset + pageSize - 1).abortSignal(signal);
      if (error) throw error;
      data.forEach((expense) => matches.add(fingerprint(expense)));
      if (data.length < pageSize) break;
    }
  }
  return matches;
}

export function findDuplicates(rows: ReviewedRow[], saved: ReadonlySet<string>) {
  const firstRows = new Map<string, number>();
  const duplicates = new Map<string, { key: string; matchesSaved: boolean; earlierRow: number | undefined }>();
  for (const { id, expense, number } of rows) {
    if (!expense) continue;
    const match = fingerprint(expense);
    const earlierRow = firstRows.get(match);
    const matchesSaved = saved.has(match);
    if (matchesSaved || earlierRow !== undefined) {
      duplicates.set(id, { key: JSON.stringify([match, matchesSaved, earlierRow]), matchesSaved, earlierRow });
    }
    if (earlierRow === undefined) firstRows.set(match, number);
  }
  return duplicates;
}
