import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const icons = [
  ['basket', 'Basket', '🧺'], ['utensils', 'Utensils', '🍴'], ['home', 'Home', '⌂'],
  ['plug', 'Plug', '🔌'], ['bus', 'Bus', '🚌'], ['fuel', 'Fuel', '⛽'],
  ['heart', 'Heart', '♥'], ['bag', 'Bag', '🛍'], ['ticket', 'Ticket', '🎟'],
  ['repeat', 'Repeat', '↻'], ['plane', 'Plane', '✈'], ['ellipsis', 'Other', '···'],
] as const;
const fields = 'id, name, color, icon, sort_order';
type Category = { id: string; name: string; color: string; icon: string; sort_order: number };

export function CategorySettings({ client }: { client: SupabaseClient }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<Category | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const editorTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const request = new AbortController();
    void client.from('categories').select(fields).order('sort_order').order('name').order('id')
      .abortSignal(request.signal).then(({ data, error }) => {
        if (request.signal.aborted) return;
        if (error) setLoadError(true);
        else setCategories(data);
      });
    return () => request.abort();
  }, [client, attempt]);

  useEffect(() => {
    if (editor) nameInput.current?.focus();
    else {
      editorTrigger.current?.focus();
      editorTrigger.current = null;
    }
  }, [editor]);

  function openEditor(next: typeof editor) {
    setEditor(next);
    setError('');
    setConfirmation('');
  }

  const existing = editor && editor !== 'new' ? editor : null;
  const existingIcon = existing?.icon ?? 'ellipsis';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    if (!name) {
      setError('Enter a category name.');
      nameInput.current?.focus();
      return;
    }

    const values = { name, color: String(form.get('color')), icon: String(form.get('icon')) };
    const table = client.from('categories');
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const write = existing ? table.update(values).eq('id', existing.id) : table.insert(values);
      const { data, error } = await write.select(fields).single();
      if (error || !data) {
        setError('Could not save the category. Your entries are still here.');
        return;
      }
      setCategories((previous) => [
        ...(previous ?? []).filter((category) => category.id !== data.id),
        data,
      ].sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name)));
      setEditor(null);
      setConfirmation(existing ? 'Category updated.' : 'Category created.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel category-settings" aria-label="Manage categories">
      <div role="status">{confirmation}</div>
      {!categories && !loadError && <p role="status">Loading categories…</p>}
      {loadError && <>
        <p role="alert">Could not load categories.</p>
        <button type="button" className="button-secondary" onClick={() => {
          setLoadError(false);
          setAttempt((value) => value + 1);
        }}>Retry</button>
      </>}
      {categories && <>
        <button type="button" disabled={!!editor} onClick={(event) => {
          editorTrigger.current = event.currentTarget;
          openEditor('new');
        }}>Add category</button>
        {editor && <form onSubmit={save} aria-label={existing ? 'Edit category' : 'New category'}>
          <fieldset className="group-form" disabled={saving}>
            <label>Name<input ref={nameInput} name="name" defaultValue={existing?.name} required
              aria-describedby={error ? 'category-save-error' : undefined} /></label>
            <label>Color<input name="color" type="color" defaultValue={existing?.color ?? '#596879'} /></label>
            <label>Icon
              <select name="icon" defaultValue={existingIcon}>
                {!icons.some(([id]) => id === existingIcon) && <option value={existingIcon}>Current icon</option>}
                {icons.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            {error && <p id="category-save-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button type="submit">{saving ? 'Saving…' : 'Save category'}</button>
              <button type="button" className="button-secondary" onClick={() => openEditor(null)}>Cancel</button>
            </div>
          </fieldset>
        </form>}
        {categories.length === 0 ? <p>No categories yet.</p> : <ul>
          {categories.map((category) => (
            <li key={category.id}>
              <div>
                <span className="category-icon" aria-hidden="true" style={{ borderColor: category.color }}>
                  {icons.find(([id]) => id === category.icon)?.[2] ?? '···'}
                </span>
                <span>{category.name}</span>
              </div>
              <button type="button" className="text-button" disabled={!!editor}
                aria-label={'Edit category ' + category.name} onClick={(event) => {
                  editorTrigger.current = event.currentTarget;
                  openEditor(category);
                }}>Edit</button>
            </li>
          ))}
        </ul>}
      </>}
    </section>
  );
}
