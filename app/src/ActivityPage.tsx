import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { dayLabel, loadMonth } from './transactions';
import type { Day, Transaction } from './transactions';
import { ExpenseForm } from './ExpenseForm';
import { formatUsd, toCents } from './money';

export function ActivityPage({ client, month, onMonthChange }: {
  client: SupabaseClient;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const [result, setResult] = useState<{ month: string; attempt: number; days: Day[] | null }>();
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [message, setMessage] = useState('');
  const refreshing = result !== undefined && result.month === month && result.attempt !== attempt;

  function finishEdit(confirmation: string) {
    setEditing(null);
    setMessage(confirmation);
    setAttempt((value) => value + 1);
  }

  useEffect(() => {
    const request = new AbortController();
    void loadMonth(client, month, request.signal).then((days) => {
      if (!request.signal.aborted) setResult({ month, attempt, days });
    });
    return () => request.abort();
  }, [client, month, attempt]);

  const loaded = result?.month === month ? result : undefined;
  return (
    <section className="panel activity-panel" aria-label="Expense history">
      <div className="activity-toolbar">
        <label>Month <input type="month" value={month} disabled={!!editing || refreshing} onChange={(event) => {
          const value = event.currentTarget.value;
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000')) {
            setResult(undefined);
            setEditing(null);
            setMessage('');
            onMonthChange(value);
          }
        }} /></label>
        <a className="action" href="#/add">Add an expense</a>
      </div>
      {message && <p role="status">{message}</p>}
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
                <div className="activity-expense-actions">
                  <strong>{formatUsd(toCents(transaction.amount))}</strong>
                  <button type="button" className="text-button" aria-label={'Edit ' + transaction.description}
                    disabled={!!editing || refreshing} aria-expanded={editing?.id === transaction.id} onClick={() => {
                      setMessage('');
                      setEditing(transaction);
                    }}>Edit</button>
                </div>
                {editing?.id === transaction.id && (
                  <ExpenseForm key={transaction.id} client={client} expense={transaction}
                    onSaved={() => finishEdit('Expense updated.')}
                    onDeleted={() => finishEdit('Expense deleted.')}
                    onCancel={() => setEditing(null)} />
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
