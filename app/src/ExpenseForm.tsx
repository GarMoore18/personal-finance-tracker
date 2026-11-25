import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday, normalizeUsdAmount } from './financialInputs';

type Category = { id: string; name: string };

export function ExpenseForm({ client, onSaved }: { client: SupabaseClient; onSaved: () => void }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const request = new AbortController();
    void (async () => {
      const { data, error } = await client.from('categories')
        .select('id, name').order('sort_order').order('name').abortSignal(request.signal);
      if (request.signal.aborted) return;
      if (error) setLoadFailed(true);
      else setCategories(data);
    })();
    return () => request.abort();
  }, [client, loadAttempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = new FormData(event.currentTarget);
    const enteredAmount = String(fields.get('amount')).trim();
    const amount = normalizeUsdAmount(enteredAmount.startsWith('.') ? '0' + enteredAmount : enteredAmount);
    const description = String(fields.get('description')).trim();
    const category = String(fields.get('category'));
    const date = String(fields.get('date'));
    const notes = String(fields.get('notes')).trim();
    if (!amount || amount.startsWith('-') || amount === '0.00') {
      setError('Enter a positive amount with up to two decimal places.');
      return;
    }
    if (!description || !date || !categories?.some(({ id }) => id === category)) {
      setError('Enter a description and date, and choose a category.');
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await client.from('transactions').insert({
        amount, description, category_id: category, occurred_on: date, notes: notes || null,
      });
      if (result.error) {
        setError('Could not save the expense. Your entries are still here.');
        return;
      }
      onSaved();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel expense-panel" aria-label="Expense details">
      {loadFailed && (
        <div>
          <p role="alert">Could not load categories.</p>
          <button type="button" className="button-secondary" onClick={() => {
            setLoadFailed(false);
            setLoadAttempt((attempt) => attempt + 1);
          }}>Retry</button>
        </div>
      )}
      {categories?.length === 0 && <p role="status">No expense categories are available for this account.</p>}
      <form onSubmit={save}>
        <fieldset className="expense-form" disabled={saving}>
          <label>Amount (USD)<input className="expense-amount" name="amount" inputMode="decimal" placeholder="0.00" required /></label>
          <label>Description<input name="description" placeholder="What was it for?" required /></label>
          <label>Category
            <select name="category" defaultValue="" disabled={!categories?.length} required>
              <option value="" disabled>{categories || loadFailed ? 'Choose a category' : 'Loading categories…'}</option>
              {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>Date<input name="date" type="date" defaultValue={localToday()} required /></label>
          <label>Notes (optional)<textarea name="notes" rows={2} /></label>
          {error && <p className="form-help" role="alert">{error}</p>}
          <button className="expense-save" disabled={!categories?.length || saving}>
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
