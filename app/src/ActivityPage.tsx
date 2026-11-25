import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday } from './financialInputs';

type Transaction = {
  id: string;
  occurred_on: string;
  description: string;
  amount: number;
  categories: { name: string } | null;
};
type Day = { date: string; total: bigint; transactions: Transaction[] };

const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});

function toCents(amount: number) {
  // Each database amount has at most two decimals and fits within safe integer cents.
  return BigInt(Math.round(amount * 100));
}

function formatUsd(cents: bigint) {
  return '$' + (cents / 100n).toLocaleString('en-US') + '.' + String(cents % 100n).padStart(2, '0');
}

export function ActivityPage({ client, month, onMonthChange }: {
  client: SupabaseClient;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const [result, setResult] = useState<{ month: string; days: Day[] | null }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    void (async () => {
      const [year, monthNumber] = month.split('-').map(Number);
      const nextMonth = monthNumber === 12
        ? String(year + 1).padStart(4, '0') + '-01'
        : String(year).padStart(4, '0') + '-' + String(monthNumber + 1).padStart(2, '0');
      const days = new Map<string, Day>();
      const batchSize = 200;
      for (let offset = 0; !request.signal.aborted; offset += batchSize) {
        const { data, error } = await client.from('transactions')
          .select('id, occurred_on, description, amount, categories(name)')
          .gte('occurred_on', month + '-01').lt('occurred_on', nextMonth + '-01')
          .order('occurred_on', { ascending: false }).order('id')
          .range(offset, offset + batchSize - 1).abortSignal(request.signal)
          .overrideTypes<Transaction[], { merge: false }>();
        if (request.signal.aborted) return;
        if (error) {
          setResult({ month, days: null });
          return;
        }
        for (const transaction of data) {
          const date = transaction.occurred_on;
          const day = days.get(date) ?? { date, total: 0n, transactions: [] };
          day.total += toCents(transaction.amount);
          day.transactions.push(transaction);
          days.set(date, day);
        }
        if (data.length < batchSize) break;
      }
      if (!request.signal.aborted) setResult({ month, days: [...days.values()] });
    })();
    return () => request.abort();
  }, [client, month, attempt]);

  const loaded = result?.month === month ? result : undefined;
  return (
    <section className="panel activity-panel" aria-label="Expense history">
      <div className="activity-toolbar">
        <label>Month <input type="month" value={month} onChange={(event) => {
          const value = event.currentTarget.value;
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000')) {
            setResult(undefined);
            onMonthChange(value);
          }
        }} /></label>
        <a className="action" href="#/add">Add an expense</a>
      </div>
      {!loaded && <p role="status">Loading expenses…</p>}
      {loaded?.days === null && (
        <>
          <p role="alert">Could not load expenses for this month.</p>
          <button type="button" className="button-secondary" onClick={() => {
            setResult(undefined);
            setAttempt((value) => value + 1);
          }}>Retry</button>
        </>
      )}
      {loaded?.days?.length === 0 && <p>No expenses for this month.</p>}
      {loaded?.days?.map((day, index) => (
        <details key={day.date} className="activity-day" open={index === 0}>
          <summary>
            <span>{dayLabel.format(new Date(day.date + 'T00:00:00Z'))}</span>
            <strong>{formatUsd(day.total)}</strong>
          </summary>
          <ul>
            {day.transactions.map((transaction) => (
              <li key={transaction.id}>
                <div>
                  <span>{transaction.description}</span>
                  <span className="activity-category">{transaction.categories?.name ?? 'Uncategorized'}</span>
                </div>
                <strong>{formatUsd(toCents(transaction.amount))}</strong>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

export function currentMonth() {
  return localToday().slice(0, 7);
}
