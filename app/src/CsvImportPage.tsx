import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultMapping, fields, mappingProblem, readCsv, reviewCsv } from './csvImport';
import type { Category, CsvSource, Mapping, ReviewValues } from './csvImport';
import { ImportRowEditor } from './ImportRowEditor';

const pageSize = 10;

export function CsvImportPage({ client }: { client: SupabaseClient }) {
  const [source, setSource] = useState<CsvSource>();
  const [mapping, setMapping] = useState<Mapping>();
  const [categories, setCategories] = useState<Category[]>();
  const [categoryError, setCategoryError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [page, setPage] = useState(0);
  const [showProblems, setShowProblems] = useState(false);
  const [corrections, setCorrections] = useState(() => new Map<string, ReviewValues>());
  const [removed, setRemoved] = useState(() => new Set<string>());
  const [editing, setEditing] = useState<string>();
  const pending = useRef(false);
  const editTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!source) return;
    const request = new AbortController();
    void client.from('categories').select('id,name').abortSignal(request.signal).then(({ data, error }) => {
      if (request.signal.aborted) return;
      if (error) setCategoryError(true);
      else setCategories(data);
    });
    return () => request.abort();
  }, [client, loadAttempt, source]);

  async function chooseFile(file: File) {
    setReading(true);
    setSource(undefined);
    setCategories(undefined);
    setCategoryError(false);
    setSavedCount(0);
    setPage(0);
    setShowProblems(false);
    setCorrections(new Map());
    setRemoved(new Set());
    setEditing(undefined);
    setError('');
    try {
      const parsed = await readCsv(file);
      if (typeof parsed === 'string') {
        setError(parsed);
        return;
      }
      setSource(parsed);
      setMapping(defaultMapping(parsed.header));
    } catch {
      setError('Could not open the file. Choose the CSV again.');
    } finally {
      setReading(false);
    }
  }

  const columnError = mapping ? mappingProblem(mapping) : '';
  const review = useMemo(() => source && mapping && !columnError && categories
    ? reviewCsv(source, mapping, categories, corrections).filter(({ id }) => !removed.has(id))
    : [], [source, mapping, columnError, categories, corrections, removed]);
  const problems = review.filter(({ problem }) => problem);
  const visibleRows = showProblems && problems.length ? problems : review;
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(visibleRows.length / pageSize) - 1));
  const editingLocked = saving || unconfirmed || editing !== undefined;

  function closeEditor() {
    setEditing(undefined);
    requestAnimationFrame(() => editTrigger.current?.focus());
  }

  async function save() {
    if (!review.length || problems.length || editing || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const expenses = review.flatMap(({ expense }) => expense ? [expense] : []);
      const { error, status } = await client.from('transactions').upsert(expenses, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        const uncertain = status === 0 || status === 408 || status >= 500;
        setUnconfirmed(unconfirmed || uncertain);
        setError(uncertain || unconfirmed ? 'Could not confirm the import. Retry from this review.' : 'Could not import the expenses. Your review is still here.');
        return;
      }
      setUnconfirmed(false);
      setSavedCount(expenses.length);
      setSource(undefined);
    } catch {
      setUnconfirmed(true);
      setError('Could not confirm the import. Retry from this review.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel csv-import" aria-label="CSV expense import">
      <label className="csv-file">CSV file
        <input type="file" accept=".csv,text/csv" disabled={reading || editingLocked}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void chooseFile(file);
          }} />
      </label>
      <p className="form-help">Choose a UTF-8 CSV with a header row and USD amounts.</p>
      {reading && <p role="status">Reading CSV…</p>}
      {error && <p className="notice-error" role="alert">{error}</p>}
      {savedCount > 0 && <p role="status">Imported {savedCount} {savedCount === 1 ? 'expense' : 'expenses'}. <a href="#/activity">View Activity</a></p>}
      {source && mapping && <>
        <p className="csv-filename">{source.name}</p>
        <fieldset className="csv-mapping group-form" disabled={editingLocked}>
          <legend>Match columns</legend>
          {fields.map(({ id, label }) => (
            <label key={id}>{label}
              <select value={mapping[id]} onChange={(event) => {
                setMapping({ ...mapping, [id]: Number(event.currentTarget.value) });
                setPage(0);
                setShowProblems(false);
                setError('');
              }}>
                <option value={-1}>{id === 'notes' ? 'Skip notes' : 'Choose column'}</option>
                {source.header.map((header, index) => <option key={index} value={index}>{index + 1}. {header || 'Unnamed column'}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
        {columnError && <p role="status">{columnError}</p>}
        {!categories && !categoryError && <p role="status">Loading categories…</p>}
        {categoryError && <div role="alert">
          <p>Could not load categories.</p>
          <button className="button-secondary" onClick={() => {
            setCategoryError(false);
            setLoadAttempt((previous) => previous + 1);
          }}>Retry</button>
        </div>}
        {!columnError && categories && <div className="csv-review">
          <h2>Review expenses</h2>
          <p role="status">{review.length} CSV {review.length === 1 ? 'row' : 'rows'}. {problems.length > 0
            ? `${problems.length} need correction. Edit or remove those rows before importing.`
            : review.length > 0 ? 'Check the rows before importing.' : 'No expenses selected.'}</p>
          {removed.size > 0 && <div className="csv-row-actions">
            <span role="status">{removed.size} {removed.size === 1 ? 'row removed' : 'rows removed'}</span>
            <button type="button" className="text-button" disabled={editingLocked} onClick={() => {
              setRemoved(new Set());
              setPage(0);
            }}>Restore removed rows</button>
          </div>}
          {problems.length > 0 && <label className="csv-problems">
            <input type="checkbox" checked={showProblems} disabled={!!editing} onChange={(event) => {
              setShowProblems(event.currentTarget.checked);
              setPage(0);
            }} /> Show only rows with problems
          </label>}
          <ol className="csv-rows" aria-label="CSV rows">
            {visibleRows.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((row) => (
              <li key={row.id}>
                <strong>{row.description || 'Missing description'}</strong>
                <span>{row.amount ? `USD ${row.amount}` : 'Missing amount'}</span>
                <small>Row {row.number} · {row.date || 'Missing date'} · {row.category || 'Missing category'}</small>
                {row.notes && <small className="csv-notes">{row.notes}</small>}
                {row.problem && <p className="notice-error">{row.problem}</p>}
                <div className="csv-row-actions">
                  <button type="button" className="text-button" aria-label={`Edit row ${row.number}`}
                    disabled={editingLocked} onClick={(event) => {
                      editTrigger.current = event.currentTarget;
                      setEditing(row.id);
                    }}>Edit</button>
                  <button type="button" className="text-button" aria-label={`Remove row ${row.number}`}
                    disabled={editingLocked} onClick={() => setRemoved((previous) => new Set(previous).add(row.id))}>Remove</button>
                </div>
                {editing === row.id && <ImportRowEditor row={row} categories={categories} onCancel={closeEditor}
                  onApply={(values) => {
                    setCorrections((previous) => new Map(previous).set(row.id, values));
                    setShowProblems(false);
                    setPage(Math.floor(review.indexOf(row) / pageSize));
                    setError('');
                    closeEditor();
                  }} />}
              </li>
            ))}
          </ol>
          {visibleRows.length > pageSize && <div className="form-actions">
            <button className="button-secondary" disabled={!!editing || visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Previous rows</button>
            <button className="button-secondary" disabled={!!editing || (visiblePage + 1) * pageSize >= visibleRows.length}
              onClick={() => setPage(visiblePage + 1)}>Next rows</button>
            <span>Rows {visiblePage * pageSize + 1}–{Math.min((visiblePage + 1) * pageSize, visibleRows.length)} of {visibleRows.length}</span>
          </div>}
          <button type="button" disabled={saving || !!editing || problems.length > 0 || !review.length} onClick={() => void save()}>
            {saving ? 'Importing…' : unconfirmed ? 'Retry import' : `Import ${review.length} ${review.length === 1 ? 'expense' : 'expenses'}`}
          </button>
        </div>}
      </>}
    </section>
  );
}
