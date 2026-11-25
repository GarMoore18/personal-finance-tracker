import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUsd, toCents } from './money';
import { currentMonth, dayLabel, groupDays, loadMonth, transactionQuery } from './transactions';
import type { Day, Transaction } from './transactions';

type Account = { id: string; name: string; current_balance: string | number };
type Overview = { count: number | null; worthFailed: boolean; spending: bigint | null; netWorth: bigint | null; accounts: Account[] | null; recent: Day[] | null };
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function HomePage({ client, onCurrentActivity }: { client: SupabaseClient; onCurrentActivity: () => void }) {
  const month = currentMonth();
  const [overview, setOverview] = useState<Overview>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const signal = request.signal;
    void (async () => {
      const [spending, worth, accounts, recent] = await Promise.all([
        loadMonth(client, month, signal),
        client.from('current_net_worth').select('net_worth').abortSignal(signal).maybeSingle(),
        client.from('accounts').select('id,name,current_balance').is('archived_at', null)
          .order('name').order('id').limit(4).abortSignal(signal),
        transactionQuery(client).limit(5).abortSignal(signal).overrideTypes<Transaction[], { merge: false }>(),
      ]);
      if (signal.aborted) return;
      setOverview({
        count: spending?.reduce((total, day) => total + day.transactions.length, 0) ?? null,
        spending: spending?.reduce((sum, day) => sum + day.total, 0n) ?? null,
        netWorth: worth.data ? toCents(worth.data.net_worth) : null,
        accounts: accounts.error ? null : accounts.data,
        worthFailed: !!worth.error,
        recent: recent.error ? null : groupDays(recent.data),
      });
    })();
    return () => request.abort();
  }, [client, month, attempt]);

  const missing = overview && (overview.worthFailed || overview.spending === null || overview.accounts === null || overview.recent === null);
  return (
    <div className="overview">
      <div className="overview-heading">
        <h1>Overview</h1>
        <span>{monthLabel.format(new Date(month + '-01T00:00:00Z'))}</span>
      </div>
      {!overview && <p role="status" className="overview-notice">Loading your overview…</p>}
      {missing && <div className="overview-error" role="alert">
        <span>Some balances or expenses couldn’t be loaded.</span>
        <button className="button-secondary" type="button" onClick={() => {
          setOverview(undefined);
          setAttempt((previous) => previous + 1);
        }}>Retry</button>
      </div>}
      <div className="overview-grid">
        <section className="panel overview-spending" aria-labelledby="spending-title">
          <h2 id="spending-title">Spending this month</h2>
          <p className="overview-amount">{overview?.spending != null ? formatUsd(overview.spending) : '—'}</p>
          {overview?.count != null && (
            <p className="overview-count">{overview.count} {overview.count === 1 ? 'expense' : 'expenses'}</p>
          )}
        </section>
        <section className="overview-activity" aria-labelledby="recent-title">
          <div className="overview-section-head">
            <h2 id="recent-title">Recent expenses</h2>
            <a className="action" href="#/activity" onClick={onCurrentActivity}>View all</a>
          </div>
          <div className="panel overview-rows">
            {overview?.recent?.length === 0 && <p>No expenses yet.</p>}
            {overview?.recent?.map((day) => (
              <div className="overview-day" key={day.date}>
                <h3>{dayLabel.format(new Date(day.date + 'T00:00:00Z'))}</h3>
                <ul className="overview-list">
                  {day.transactions.map((expense) => {
                    const category = expense.categories?.name ?? 'Uncategorized';
                    return (
                      <li key={expense.id}>
                        <span className="overview-category" aria-hidden="true">{Array.from(category)[0]}</span>
                        <div><span>{expense.description}</span><small>{category}</small></div>
                        <strong>{formatUsd(toCents(expense.amount))}</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
        <section className="panel overview-accounts" aria-labelledby="worth-title">
          <div className="overview-section-head">
            <h2 id="worth-title">Net worth</h2>
            <a className="action" href="#/accounts">View accounts</a>
          </div>
          <p className="overview-amount">{overview?.netWorth != null ? formatUsd(overview.netWorth) : '—'}</p>
          {overview?.accounts?.length === 0 && !overview.worthFailed && <p>Add an account to see your net worth.</p>}
          {!!overview?.accounts?.length && (
            <ul className="overview-list" aria-label="Account balances">
              {overview.accounts.map(({ id, name, current_balance: balance }) => (
                <li key={id}><span>{name}</span><strong>{formatUsd(toCents(balance))}</strong></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
