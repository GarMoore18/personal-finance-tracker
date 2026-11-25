import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday, normalizeUsdAmount } from './financialInputs';
import type { Transaction } from './transactions';

type Category = { id: string; name: string };

export function ExpenseForm({ client, onSaved, expense, onCancel, onDeleted }: {
  client: SupabaseClient;
  onSaved: () => void;
  expense?: Transaction;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const transaction = {
        amount, description, category_id: category, occurred_on: date, notes: notes || null,
      };
      const table = client.from('transactions');
      const result = expense
        ? await table.update(transaction).eq('id', expense.id).select('id').maybeSingle()
        : await table.insert(transaction);
      if (result.error || (expense && !result.data)) {
        setError('Could not save the expense. Your entries are still here.');
        return;
      }
      onSaved();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function deleteExpense() {
    if (!expense || submitting.current) return;
    submitting.current = true;
    setDeleting(true);
    setError('');
    try {
      const { data, error } = await client.from('transactions')
        .delete().eq('id', expense.id).select('id').maybeSingle();
      if (error || !data) {
        setError('Could not delete the expense. Try again.');
        return;
      }
      onDeleted?.();
    } finally {
      submitting.current = false;
      setDeleting(false);
    }
  }

  return (
    <section className="panel expense-panel" aria-label={expense ? 'Edit expense' : 'Expense details'}>
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
        <fieldset className="expense-form" disabled={saving || deleting || confirmDelete}>
          <label>Amount (USD)<input className="expense-amount" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={expense?.amount} required /></label>
          <label>Description<input name="description" placeholder="What was it for?" defaultValue={expense?.description} required /></label>
          <label>Category
            <select key={categories === null ? 'loading' : 'loaded'} name="category" defaultValue={expense?.category_id ?? ''} disabled={!categories?.length} required>
              <option value="" disabled>{categories || loadFailed ? 'Choose a category' : 'Loading categories…'}</option>
              {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>Date<input name="date" type="date" defaultValue={expense?.occurred_on ?? localToday()} required /></label>
          <label>Notes (optional)<textarea name="notes" rows={2} defaultValue={expense?.notes ?? ''} /></label>
          <button className="expense-save" disabled={!categories?.length || saving}>
            {saving ? 'Saving…' : expense ? 'Save changes' : 'Save expense'}
          </button>
          {expense && <div className="expense-edit-actions">
            <button className="button-secondary" type="button" onClick={onCancel}>Cancel</button>
            <button className="button-secondary expense-delete" type="button" onClick={() => {
              setError('');
              setConfirmDelete(true);
            }}>Delete expense</button>
          </div>}
        </fieldset>
      </form>
      {confirmDelete && <div className="expense-confirm-delete">
        <p>Delete “{expense?.description}”?</p>
        <div className="expense-edit-actions">
          <button className="button-secondary" type="button" disabled={deleting} autoFocus onClick={() => {
            setConfirmDelete(false);
            setError('');
          }}>Keep expense</button>
          <button className="expense-delete-primary" type="button" disabled={deleting} onClick={deleteExpense}>
            {deleting ? 'Deleting…' : 'Confirm deletion'}
          </button>
        </div>
      </div>}
      {error && <p className="form-help" role="alert">{error}</p>}
    </section>
  );
}
