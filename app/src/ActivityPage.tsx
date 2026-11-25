import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { dayLabel, loadMonth } from './transactions';
import type { Day } from './transactions';
import { formatUsd, toCents } from './money';

export function ActivityPage({ client, month, onMonthChange }: {
  client: SupabaseClient;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const [result, setResult] = useState<{ month: string; days: Day[] | null }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    void loadMonth(client, month, request.signal).then((days) => {
      if (!request.signal.aborted) setResult({ month, days });
    });
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
