import type { FormEvent } from 'react';
import type { Category, ReviewedRow, ReviewValues } from './csvImport';

export function ImportRowEditor({ row, categories, onApply, onCancel }: {
  row: ReviewedRow;
  categories: Category[];
  onApply: (values: ReviewValues) => void;
  onCancel: () => void;
}) {
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onApply({
      date: String(values.get('date') ?? ''),
      amount: String(values.get('amount') ?? ''),
      description: String(values.get('description') ?? ''),
      categoryId: String(values.get('category') ?? ''),
      notes: String(values.get('notes') ?? ''),
    });
  }

  return (
    <form className="csv-row-editor" aria-label={`Edit row ${row.number}`} onSubmit={apply}>
      <label>Date<input name="date" defaultValue={row.date} placeholder="YYYY-MM-DD" autoFocus /></label>
      <label>Amount (USD)<input name="amount" defaultValue={row.amount} inputMode="decimal" /></label>
      <label>Description<input name="description" defaultValue={row.description} /></label>
      <label>Category
        <select name="category" defaultValue={row.categoryId}>
          <option value="">Choose a category</option>
          {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label>Notes (optional)<textarea name="notes" defaultValue={row.notes} rows={2} /></label>
      <div className="form-actions">
        <button type="submit">Apply changes</button>
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
