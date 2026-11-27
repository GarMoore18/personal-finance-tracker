import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUsd, toCents } from './money';
import { currentMonth, dayLabel, groupDays, loadMonthSpending, transactionQuery } from './transactions';
import type { DailyTotal, Day, Transaction } from './transactions';
import { ExpenseForm } from './ExpenseForm';
import type { DashboardPreferences } from './dashboardPreferences';

type Account = { id: string; name: string; current_balance: string | number };
type ExpenseOverview = { spending: Awaited<ReturnType<typeof loadMonthSpending>>; recent: Day[] | null };
type BalanceOverview = { worthFailed: boolean; netWorth: bigint | null; accounts: Account[] | null };
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

function DailySpending({ days, month }: { days: DailyTotal[]; month: string }) {
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
  const [expenses, setExpenses] = useState<ExpenseOverview>();
  const [balances, setBalances] = useState<BalanceOverview>();
  const [retry, setRetry] = useState(0);
  const [expenseRefresh, setExpenseRefresh] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!widgets.spending && !widgets.recent) return;
    const request = new AbortController();
    const signal = request.signal;
    void (async () => {
      const [spending, recent] = await Promise.all([
        widgets.spending ? loadMonthSpending(client, month, signal) : null,
        widgets.recent ? transactionQuery(client).limit(5).abortSignal(signal)
          .overrideTypes<Transaction[], { merge: false }>() : null,
      ]);
      if (signal.aborted) return;
      setExpenses({ spending, recent: recent?.data ? groupDays(recent.data) : null });
    })();
    return () => request.abort();
  }, [client, month, retry, expenseRefresh, widgets.spending, widgets.recent]);

  useEffect(() => {
    if (!widgets.worth) return;
    const request = new AbortController();
    const signal = request.signal;
    void (async () => {
      const [worth, accounts] = await Promise.all([
        client.from('current_net_worth').select('net_worth').abortSignal(signal).maybeSingle(),
        client.from('accounts').select('id,name,current_balance').is('archived_at', null)
          .order('name').order('id').limit(4).abortSignal(signal),
      ]);
      if (signal.aborted) return;
      setBalances({
        netWorth: worth?.data ? toCents(worth.data.net_worth) : null,
        accounts: accounts?.data ?? null,
        worthFailed: !!worth?.error,
      });
    })();
    return () => request.abort();
  }, [client, retry, widgets.worth]);

  const hasExpenseWidgets = widgets.spending || widgets.recent;
  const hasWidgets = hasExpenseWidgets || widgets.worth;
  const loading = (hasExpenseWidgets && !expenses) || (widgets.worth && !balances);
  const missing = (
    (widgets.worth && balances && (balances.worthFailed || balances.accounts === null)) ||
    (widgets.spending && expenses?.spending === null) ||
    (widgets.recent && expenses?.recent === null)
  );
  return (
    <div className="overview">
      <div className="overview-heading">
        <h1>Overview</h1>
        <button type="button" className="overview-quick-add" aria-expanded={quickAddOpen} aria-controls="quick-add-expense"
          aria-label={quickAddOpen ? 'Close quick add' : 'Quick add expense'}
          onClick={() => {
            setQuickAddOpen((open) => !open);
            setSavedCount(0);
          }}>
          <span aria-hidden="true">{quickAddOpen ? '×' : '+'}</span>
          {quickAddOpen ? 'Close' : 'Quick add'}
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
          setExpenseRefresh((previous) => previous + 1);
        }} />}
      </div>
      {loading && <p role="status" className="overview-notice">Loading your overview…</p>}
      {missing && <div className="overview-error" role="alert">
        <span>Some balances or expenses couldn’t be loaded.</span>
        <button className="button-secondary" type="button" onClick={() => {
          setRetry((previous) => previous + 1);
        }}>Retry</button>
      </div>}
      {!hasWidgets && <p className="overview-notice">Choose widgets in <a href="#/more">Settings</a> to show them here.</p>}
      {hasWidgets && <div className="overview-grid">
        {widgets.spending && <section className="panel overview-spending" aria-labelledby="spending-title">
          <div className="overview-spending-meta">
            <h2 id="spending-title">Spending this month</h2>
            <span>{monthLabel.format(new Date(month + '-01T00:00:00Z'))}</span>
          </div>
          <p className="overview-amount">{expenses?.spending ? formatUsd(expenses.spending.total) : '—'}</p>
          {expenses?.spending && <div className="overview-spending-footer">
            <p className="overview-count">{expenses.spending.count} {expenses.spending.count === 1 ? 'expense' : 'expenses'}</p>
            <DailySpending days={expenses.spending.days} month={month} />
          </div>}
        </section>}
        {widgets.worth && <section className="panel overview-accounts" aria-labelledby="worth-title">
          <div className="overview-section-head">
            <h2 id="worth-title">Net worth</h2>
            <a className="action" href="#/accounts">View accounts</a>
          </div>
          <p className="overview-amount">{balances?.netWorth != null ? formatUsd(balances.netWorth) : '—'}</p>
          {balances?.accounts?.length === 0 && !balances.worthFailed && <p>Add an account to see your net worth.</p>}
          {!!balances?.accounts?.length && (
            <ul className="overview-list" aria-label="Account balances">
              {balances.accounts.map(({ id, name, current_balance: balance }) => (
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
            {expenses?.recent?.length === 0 && <p>No expenses yet.</p>}
            {expenses?.recent?.map((day) => (
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
