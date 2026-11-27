import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { dayLabel, groupDays, loadMonth } from './transactions';
import type { Day, Transaction } from './transactions';
import { ExpenseForm } from './ExpenseForm';
import { formatUsd, toCents } from './money';
import { normalizeUsdAmount } from './financialInputs';

const emptyFilters = { category: '', from: '', through: '', minimum: '', maximum: '' };
const dateFields = [['from', 'From date'], ['through', 'Through date']] as const;
const amountFields = [['minimum', 'Minimum amount (USD)'], ['maximum', 'Maximum amount (USD)']] as const;

function amountBound(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const amount = normalizeUsdAmount(trimmed.startsWith('.') ? '0' + trimmed : trimmed);
  return amount && !amount.startsWith('-') ? toCents(amount) : null;
}

export function ActivityPage({ client, month, onMonthChange }: {
  client: SupabaseClient;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const [result, setResult] = useState<{ month: string; attempt: number; days: Day[] | null }>();
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const searchInput = useRef<HTMLInputElement>(null);
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
  const query = search.trim().toLocaleLowerCase();
  const days = loaded?.days;
  const transactions = days?.flatMap((day) => day.transactions) ?? [];
  const categories = new Map(transactions.map(({ category_id, categories }) =>
    [category_id, categories?.name ?? 'Uncategorized']));
  const categoryOptions = [...categories].sort(([, left], [, right]) => left.localeCompare(right));
  const hasDates = !!(filters.from || filters.through);
  const hasAmounts = !!(filters.minimum.trim() || filters.maximum.trim());
  const filterCount = Number(!!filters.category) + Number(hasDates) + Number(hasAmounts);
  const minimum = amountBound(filters.minimum);
  const maximum = amountBound(filters.maximum);
  const dateError = !!(filters.from && filters.through && filters.from > filters.through);
  const amountError = minimum === null || maximum === null
    ? 'Enter nonnegative amounts with up to two decimal places.'
    : minimum !== undefined && maximum !== undefined && minimum > maximum
      ? 'The maximum amount must be at least the minimum amount.'
      : '';
  const isRefined = !!query || filterCount > 0;
  const visibleDays = isRefined && days
    ? groupDays(transactions.filter((transaction) => {
      const cents = toCents(transaction.amount);
      return (!query || transaction.description.toLocaleLowerCase().includes(query)) &&
        (!filters.category || transaction.category_id === filters.category) &&
        (dateError || ((!filters.from || transaction.occurred_on >= filters.from) &&
          (!filters.through || transaction.occurred_on <= filters.through))) &&
        (amountError || ((minimum == null || cents >= minimum) && (maximum == null || cents <= maximum)));
    }))
    : days;
  return (
    <section className="panel activity-panel" aria-label="Expense history">
      <div className="activity-toolbar">
        <label>Month <input type="month" value={month} disabled={!!editing || refreshing} onChange={(event) => {
          const value = event.currentTarget.value;
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && !value.startsWith('0000')) {
            setResult(undefined);
            setEditing(null);
            setMessage('');
            setFilters(emptyFilters);
            onMonthChange(value);
          }
        }} /></label>
        <a className="action" href="#/add">Add an expense</a>
      </div>
      <details className="activity-filters">
        <summary>Filters{filterCount > 0 && ` (${filterCount} active)`}</summary>
        <fieldset aria-label="Filter expenses in the selected month" disabled={!!editing}>
          <label>Category
            <select value={filters.category} onChange={(event) => {
              setFilters({ ...filters, category: event.currentTarget.value });
            }}>
              <option value="">All categories</option>
              {filters.category && !categories.has(filters.category) &&
                <option value={filters.category}>Selected category</option>}
              {categoryOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <div className="activity-filter-range">
            {dateFields.map(([field, label]) => (
              <label key={field}>{label}
                <input type="date" value={filters[field]} aria-invalid={dateError || undefined}
                  aria-describedby={dateError ? 'activity-date-error' : undefined}
                  onChange={(event) => setFilters({ ...filters, [field]: event.currentTarget.value })} />
              </label>
            ))}
          </div>
          {dateError && <p role="alert" id="activity-date-error">The through date must be on or after the from date.</p>}
          {hasDates && <button type="button" className="button-secondary"
            onClick={() => setFilters({ ...filters, from: '', through: '' })}>Clear dates</button>}
          <div className="activity-filter-range">
            {amountFields.map(([field, label]) => (
              <label key={field}>{label}
                <input inputMode="decimal" value={filters[field]} aria-invalid={!!amountError || undefined}
                  aria-describedby={amountError ? 'activity-amount-error' : undefined}
                  onChange={(event) => setFilters({ ...filters, [field]: event.currentTarget.value })} />
              </label>
            ))}
          </div>
          {amountError && <p role="alert" id="activity-amount-error">{amountError}</p>}
          {hasAmounts && <button type="button" className="button-secondary"
            onClick={() => setFilters({ ...filters, minimum: '', maximum: '' })}>Clear amounts</button>}
          {filterCount > 0 && <button type="button" className="button-secondary"
            onClick={() => setFilters(emptyFilters)}>Reset filters</button>}
        </fieldset>
      </details>
      <div className="activity-toolbar activity-search" role="search" aria-label="Expenses in the selected month">
        <label>Search descriptions
          <input ref={searchInput} type="search" value={search} disabled={!!editing} onChange={(event) => {
            setSearch(event.currentTarget.value);
          }} />
        </label>
        {search && <button type="button" className="button-secondary" disabled={!!editing} onClick={() => {
          setSearch('');
          searchInput.current?.focus();
        }}>Clear search</button>}
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
      {days?.length === 0 && <p>No expenses for this month.</p>}
      {isRefined && !!days?.length && visibleDays?.length === 0 && (
        <p role="status">No expenses match your {filterCount > 0 ? 'filters' : 'search'} for this month.</p>
      )}
      {visibleDays?.map((day, index) => (
        <details key={isRefined ? 'refined-' + day.date : day.date} className="activity-day" open={isRefined || index === 0}>
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
