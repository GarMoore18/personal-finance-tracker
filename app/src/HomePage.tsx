import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUsd, toCents } from './money';
import { currentMonth, dayLabel, groupDays, loadMonth, transactionQuery } from './transactions';
import type { Day, Transaction } from './transactions';
import { ExpenseForm } from './ExpenseForm';
import type { DashboardPreferences } from './dashboardPreferences';

type Account = { id: string; name: string; current_balance: string | number };
type Overview = { count: number | null; worthFailed: boolean; spending: bigint | null; spendingDays: Day[]; netWorth: bigint | null; accounts: Account[] | null; recent: Day[] | null };
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

function DailySpending({ days, month }: { days: Day[]; month: string }) {
  if (!days.length) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const byDate = new Map(days.map(({ date, total }) => [date, total]));
  const peak = days.reduce((highest, day) => day.total > highest.total ? day : highest);
  if (peak.total <= 0n) return null;
  const peakDate = dayLabel.format(new Date(peak.date + 'T00:00:00Z'));
  return (
    <figure className="overview-chart">
      <figcaption>Daily spending</figcaption>
      <div className="overview-chart-bars" role="img" aria-label={`Daily totals from the first to the last day of the month. Peak: ${formatUsd(peak.total)} on ${peakDate}.`}>
        {Array.from({ length: dayCount }, (_, index) => {
          const date = month + '-' + String(index + 1).padStart(2, '0');
          const total = byDate.get(date) ?? 0n;
          const height = Number(total * 1000n / peak.total) / 10;
          return <span key={date} style={{ height: `${height}%` }}
            title={`${dayLabel.format(new Date(date + 'T00:00:00Z'))} · ${formatUsd(total)}`} />;
        })}
      </div>
    </figure>
  );
}

export function HomePage({ client, onCurrentActivity, widgets }: {
  client: SupabaseClient;
  onCurrentActivity: () => void;
  widgets: DashboardPreferences;
}) {
  const month = currentMonth();
  const [overview, setOverview] = useState<Overview>();
  const [attempt, setAttempt] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    const signal = request.signal;
    void (async () => {
      const [spending, worth, accounts, recent] = await Promise.all([
        widgets.spending ? loadMonth(client, month, signal) : null,
        widgets.worth ? client.from('current_net_worth').select('net_worth').abortSignal(signal).maybeSingle() : null,
        widgets.worth ? client.from('accounts').select('id,name,current_balance').is('archived_at', null)
          .order('name').order('id').limit(4).abortSignal(signal) : null,
        widgets.recent ? transactionQuery(client).limit(5).abortSignal(signal)
          .overrideTypes<Transaction[], { merge: false }>() : null,
      ]);
      if (signal.aborted) return;
      setOverview({
        count: spending?.reduce((total, day) => total + day.transactions.length, 0) ?? null,
        spending: spending?.reduce((sum, day) => sum + day.total, 0n) ?? null,
        spendingDays: spending ?? [],
        netWorth: worth?.data ? toCents(worth.data.net_worth) : null,
        accounts: accounts?.data ?? null,
        worthFailed: !!worth?.error,
        recent: recent?.data ? groupDays(recent.data) : null,
      });
    })();
    return () => request.abort();
  }, [client, month, attempt, widgets]);

  const hasWidgets = widgets.spending || widgets.recent || widgets.worth;
  const missing = overview && (
    (widgets.worth && (overview.worthFailed || overview.accounts === null)) ||
    (widgets.spending && overview.spending === null) ||
    (widgets.recent && overview.recent === null)
  );
  return (
    <div className="overview">
      <div className="overview-heading">
        <h1>Overview</h1>
        <button type="button" className="overview-quick-add" aria-expanded={quickAddOpen} aria-controls="quick-add-expense"
          onClick={() => {
            setQuickAddOpen((open) => !open);
            setSavedCount(0);
          }}>
          <span aria-hidden="true">{quickAddOpen ? '×' : '+'}</span>
          {quickAddOpen ? 'Close quick add' : 'Quick add expense'}
        </button>
      </div>
      <div id="quick-add-expense" hidden={!quickAddOpen}>
        <div role="status">
          {savedCount > 0 && <p className="expense-confirmation">
            {savedCount === 1 ? 'Expense saved.' : `${savedCount} expenses saved.`}
          </p>}
        </div>
        {quickAddOpen && <ExpenseForm client={client} quickAdd onSaved={() => {
          setSavedCount((count) => count + 1);
          setAttempt((previous) => previous + 1);
        }} />}
      </div>
      {hasWidgets && !overview && <p role="status" className="overview-notice">Loading your overview…</p>}
      {missing && <div className="overview-error" role="alert">
        <span>Some balances or expenses couldn’t be loaded.</span>
        <button className="button-secondary" type="button" onClick={() => {
          setOverview(undefined);
          setAttempt((previous) => previous + 1);
        }}>Retry</button>
      </div>}
      {!hasWidgets && <p className="overview-notice">Choose widgets in <a href="#/more">Settings</a> to show them here.</p>}
      {hasWidgets && <div className="overview-grid">
        {widgets.spending && <section className="panel overview-spending" aria-labelledby="spending-title">
          <div className="overview-spending-meta">
            <h2 id="spending-title">Spending this month</h2>
            <span>{monthLabel.format(new Date(month + '-01T00:00:00Z'))}</span>
          </div>
          <p className="overview-amount">{overview?.spending != null ? formatUsd(overview.spending) : '—'}</p>
          {overview?.count != null && <div className="overview-spending-footer">
            <p className="overview-count">{overview.count} {overview.count === 1 ? 'expense' : 'expenses'}</p>
            <DailySpending days={overview.spendingDays} month={month} />
          </div>}
        </section>}
        {widgets.worth && <section className="panel overview-accounts" aria-labelledby="worth-title">
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
        </section>}
        {widgets.recent && <section className="panel overview-activity" aria-labelledby="recent-title">
          <div className="overview-section-head">
            <h2 id="recent-title">Recent expenses</h2>
            <a className="action" href="#/activity" onClick={onCurrentActivity}>View all</a>
          </div>
          <div className="overview-rows">
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
        </section>}
      </div>}
    </div>
  );
}
