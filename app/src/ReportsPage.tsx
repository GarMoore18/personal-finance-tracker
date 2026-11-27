import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUsd } from './money';
import {
  balanceTrend, loadBalancesReport, loadSpendingReport, reportMonthLabel, reportMonths,
  spendingByCategory, spendingTrend,
} from './reports';
import type { BalancesReport, ReportPoint, SpendingReport } from './reports';

function ReportChart({ points, label }: { points: ReportPoint[]; label: string }) {
  const signed = points.some(({ cents }) => cents !== null && cents < 0n);
  const max = points.reduce((largest, { cents }) => {
    const magnitude = cents === null ? 0n : cents < 0n ? -cents : cents;
    return magnitude > largest ? magnitude : largest;
  }, 0n);
  return (
    <ul className={signed ? 'report-chart report-chart-signed' : 'report-chart'} role="list" aria-label={label}>
      {points.map(({ label, cents }, index) => {
        const magnitude = cents === null ? 0n : cents < 0n ? -cents : cents;
        const width = magnitude > 0n ? Math.max(1, Number(magnitude * 100n / max)) : 0;
        return (
          <li key={index}>
            <span>{label}</span>
            <span className="report-track" aria-hidden="true">
              <span className={cents !== null && cents < 0n ? 'report-bar report-bar-negative' : 'report-bar'}
                style={{ width: width * (signed ? 0.5 : 1) + '%' }} />
            </span>
            <strong>{cents === null ? '—' : formatUsd(cents)}</strong>
          </li>
        );
      })}
    </ul>
  );
}

function Spending({ report, months, month, setMonth }: {
  report: SpendingReport; months: string[]; month: string; setMonth: (month: string) => void;
}) {
  const categories = spendingByCategory(report, month);
  const total = categories.reduce((sum, { cents }) => sum + (cents ?? 0n), 0n);
  return (
    <div className="report-grid">
      <section className="panel report-panel" aria-labelledby="category-report">
        <h2 id="category-report">Spending by category</h2>
        <label className="report-filter group-form">Month
          <select value={month} onChange={(event) => setMonth(event.currentTarget.value)}>
            {months.slice().reverse().map((period) => <option key={period} value={period}>{reportMonthLabel(period)}</option>)}
          </select>
        </label>
        {categories.length ? <>
          <p className="report-summary"><strong>{formatUsd(total)}</strong><span>Total spending</span></p>
          <ReportChart points={categories} label="Category totals in USD" />
        </> : <p className="form-help">No expenses for this month.</p>}
      </section>
      <section className="panel report-panel" aria-labelledby="spending-report">
        <h2 id="spending-report">Spending trend</h2>
        <p className="form-help">Monthly expenses in USD</p>
        {report.size ? <ReportChart points={spendingTrend(report, months)} label="Monthly spending in USD" />
          : <p className="form-help">No expenses in this period.</p>}
      </section>
    </div>
  );
}

function Balances({ report, months, selectedAccount, setAccountId }: {
  report: BalancesReport; months: string[]; selectedAccount: string; setAccountId: (id: string) => void;
}) {
  const defaultAccount = report.accounts.find(({ archived_at }) => !archived_at) ?? report.accounts[0];
  const accountId = selectedAccount || defaultAccount?.id || '';
  const history = balanceTrend(report.histories.get(accountId), months);
  return (
    <div className="report-grid">
      <section className="panel report-panel" aria-labelledby="balance-report">
        <h2 id="balance-report">Account balance history</h2>
        {report.accounts.length > 0 && <label className="report-filter group-form">Account
          <select value={accountId} onChange={(event) => setAccountId(event.currentTarget.value)}>
            {report.accounts.map(({ id, name, archived_at }) =>
              <option key={id} value={id}>{name}{archived_at ? ' (archived)' : ''}</option>)}
          </select>
        </label>}
        {history.some(({ cents }) => cents !== null) ? <>
          <p className="form-help">Latest recorded balance each month. A dash means no observation.</p>
          <ReportChart points={history} label="Monthly account balances in USD" />
        </> : <p className="form-help">{accountId ? 'No balances recorded in this period.' : 'No accounts yet.'}</p>}
      </section>
      <section className="panel report-panel" aria-labelledby="worth-report">
        <h2 id="worth-report">Net worth history</h2>
        {report.totals.size ? <>
          <p className="form-help">Assets minus liabilities. Uses each account’s latest recorded balance and excludes it from its archive month onward.</p>
          <ReportChart points={balanceTrend(report.totals, months)} label="Monthly net worth in USD" />
        </> : <p className="form-help">No balance history for this period.</p>}
      </section>
    </div>
  );
}

const views = ['Spending', 'Balances'] as const;

export default function ReportsPage({ client }: { client: SupabaseClient }) {
  const [view, setView] = useState<(typeof views)[number]>('Spending');
  const [months] = useState(reportMonths);
  const [month, setMonth] = useState(months[months.length - 1]);
  const [accountId, setAccountId] = useState('');
  const [spending, setSpending] = useState<SpendingReport>();
  const [balances, setBalances] = useState<BalancesReport>();
  const [failedView, setFailedView] = useState<(typeof views)[number]>();
  const [attempt, setAttempt] = useState(0);
  const loaded = !!(view === 'Spending' ? spending : balances);

  useEffect(() => {
    if (loaded) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        if (view === 'Spending') {
          const report = await loadSpendingReport(client, months, signal);
          if (!signal.aborted) setSpending(report);
        } else {
          const report = await loadBalancesReport(client, months, signal);
          if (!signal.aborted) setBalances(report);
        }
      } catch {
        if (!signal.aborted) setFailedView(view);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, client, loaded, months, view]);

  return (
    <section className="report-page" aria-label="Financial reports">
      <p className="report-period">{reportMonthLabel(months[0])} to {reportMonthLabel(months[months.length - 1])} · USD</p>
      <div role="group" aria-label="Report type" className="report-switch">
        {views.map((option) => <button key={option} className="button-secondary" type="button"
          aria-pressed={view === option} onClick={() => {
            if (option !== view) {
              setFailedView(undefined);
              setView(option);
            }
          }}>{option}</button>)}
      </div>
      {!loaded && (failedView === view ? <div className="panel" role="alert">
        <p>Could not load the report.</p>
        <button type="button" className="button-secondary" onClick={() => {
          setFailedView(undefined);
          setAttempt((previous) => previous + 1);
        }}>Retry</button>
      </div> : <p role="status">Loading report…</p>)}
      {view === 'Spending' && spending && <Spending report={spending} months={months} month={month} setMonth={setMonth} />}
      {view === 'Balances' && balances && <Balances report={balances} months={months} selectedAccount={accountId} setAccountId={setAccountId} />}
    </section>
  );
}
