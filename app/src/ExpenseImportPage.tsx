import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultMapping, fields, mappingProblem, readCsv, reviewExpenses } from './expenseImport';
import type { Category, ImportSource, Mapping, ReviewValues } from './expenseImport';
import { ImportRowEditor } from './ImportRowEditor';
import { findDuplicates, loadSavedMatches } from './importDuplicates';
import { readExcel } from './excelImport';
import type { Worksheet } from './excelImport';

const pageSize = 10;
type DuplicateChoice = { key: string; action: 'keep' | 'skip' };
type DuplicateLookup = { key: string; matches: Set<string> | null };

export function ExpenseImportPage({ client }: { client: SupabaseClient }) {
  const [source, setSource] = useState<ImportSource>();
  const [upload, setUpload] = useState<{ name: string; worksheets?: Worksheet[] }>();
  const [worksheet, setWorksheet] = useState(-1);
  const [completedWorksheets, setCompletedWorksheets] = useState(() => new Set<number>());
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
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [corrections, setCorrections] = useState(() => new Map<string, ReviewValues>());
  const [removed, setRemoved] = useState(() => new Set<string>());
  const [editing, setEditing] = useState<string>();
  const [lookup, setLookup] = useState<DuplicateLookup>();
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [choices, setChoices] = useState(() => new Map<string, DuplicateChoice>());
  const pending = useRef(false);
  const editTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!upload) return;
    const request = new AbortController();
    void client.from('categories').select('id,name').abortSignal(request.signal).then(({ data, error }) => {
      if (request.signal.aborted) return;
      if (error) setCategoryError(true);
      else setCategories(data);
    });
    return () => request.abort();
  }, [client, loadAttempt, upload]);

  function startReview(nextSource?: ImportSource) {
    setSource(nextSource);
    setMapping(nextSource && defaultMapping(nextSource.header));
    setPage(0);
    setShowProblems(false);
    setShowDuplicates(false);
    setCorrections(new Map());
    setRemoved(new Set());
    setEditing(undefined);
    setChoices(new Map());
    setLookup(undefined);
    setError('');
  }

  async function chooseFile(file: File) {
    setReading(true);
    setUpload(undefined);
    setCategories(undefined);
    setCategoryError(false);
    setSavedCount(0);
    setWorksheet(-1);
    setCompletedWorksheets(new Set());
    startReview();
    const extension = file.name.split('.').pop()?.toLowerCase();
    try {
      if (extension === 'xlsx') {
        const worksheets = await readExcel(file);
        if (typeof worksheets === 'string') {
          setError(worksheets);
          return;
        }
        const first = worksheets.findIndex(({ source }) => source);
        setWorksheet(first);
        startReview(worksheets[first].source);
        setUpload({ name: file.name, worksheets });
      } else if (extension === 'csv') {
        const parsed = await readCsv(file);
        if (typeof parsed === 'string') {
          setError(parsed);
          return;
        }
        startReview(parsed);
        setUpload({ name: file.name });
      } else {
        setError('Choose a .csv or .xlsx file.');
      }
    } catch {
      setError(extension === 'xlsx'
        ? 'Could not open this Excel workbook. Choose a valid, unencrypted .xlsx file.'
        : 'Could not open the CSV. Choose a UTF-8 CSV file.');
    } finally {
      setReading(false);
    }
  }

  const columnError = mapping ? mappingProblem(mapping) : '';
  const review = useMemo(() => source && mapping && !columnError && categories
    ? reviewExpenses(source, mapping, categories, corrections).filter(({ id }) => !removed.has(id))
    : [], [source, mapping, columnError, categories, corrections, removed]);
  const problems = review.filter(({ problem }) => problem);
  const datesKey = useMemo(() => [...new Set(review.flatMap(({ expense }) =>
    expense ? [expense.occurred_on] : []))].sort().join(','), [review]);
  const lookupKey = JSON.stringify([source?.rows[0].id, datesKey, lookupAttempt]);

  useEffect(() => {
    if (!datesKey) return;
    const request = new AbortController();
    void loadSavedMatches(client, datesKey.split(','), request.signal)
      .then((matches) => {
        if (!request.signal.aborted) setLookup({ key: lookupKey, matches });
      })
      .catch(() => {
        if (!request.signal.aborted) setLookup({ key: lookupKey, matches: null });
      });
    return () => request.abort();
  }, [client, datesKey, lookupKey]);

  const currentLookup = lookup?.key === lookupKey ? lookup : undefined;
  const duplicates = useMemo(() => currentLookup?.matches && findDuplicates(review, currentLookup.matches),
    [currentLookup, review]);
  const duplicateChoices = new Map<string, DuplicateChoice['action']>();
  let unresolved = 0;
  for (const [id, match] of duplicates ?? []) {
    const choice = choices.get(id);
    if (choice?.key === match.key) duplicateChoices.set(id, choice.action);
    else unresolved += 1;
  }
  const expenses = review.flatMap(({ id, expense }) => expense && duplicateChoices.get(id) !== 'skip' ? [expense] : []);
  const visibleRows = showProblems && problems.length ? problems
    : showDuplicates && duplicates?.size ? review.filter(({ id }) => duplicates.has(id)) : review;
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(visibleRows.length / pageSize) - 1));
  const editingLocked = saving || unconfirmed || editing !== undefined;
  const canImport = !!currentLookup?.matches && expenses.length > 0 && !problems.length && !unresolved && !editing;
  const importCount = expenses.length + problems.length;
  const worksheets = upload?.worksheets;
  const rowLabel = worksheets ? 'worksheet row' : 'CSV row';

  function closeEditor() {
    setEditing(undefined);
    requestAnimationFrame(() => editTrigger.current?.focus());
  }

  async function save() {
    if (!canImport || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const { error, status } = await client.from('transactions').upsert(expenses, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        const uncertain = status === 0 || status === 408 || status >= 500;
        setUnconfirmed(unconfirmed || uncertain);
        setError(uncertain || unconfirmed ? 'Could not confirm the import. Retry from this review.' : 'Could not import the expenses. Your review is still here.');
        return;
      }
      setUnconfirmed(false);
      setSavedCount(expenses.length);
      startReview();
      const completed = new Set(completedWorksheets).add(worksheet);
      if (worksheets?.some(({ source }, index) => source && !completed.has(index))) {
        setCompletedWorksheets(completed);
        setWorksheet(-1);
      } else {
        setUpload(undefined);
      }
    } catch {
      setUnconfirmed(true);
      setError('Could not confirm the import. Retry from this review.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="panel csv-import" aria-label="Expense import">
      <label className="csv-file">Expense file
        <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={reading || editingLocked}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void chooseFile(file);
          }} />
      </label>
      <p className="form-help">Choose a CSV or Excel (.xlsx) file with a header row and USD amounts.</p>
      {reading && <p role="status">Reading file…</p>}
      {error && <p className="notice-error" role="alert">{error}</p>}
      {savedCount > 0 && <p role="status">Imported {savedCount} {savedCount === 1 ? 'expense' : 'expenses'}. <a href="#/activity">View Activity</a></p>}
      {upload && <p className="csv-filename">{upload.name}</p>}
      {worksheets && <div className="group-form">
        <label>Worksheet
          <select value={worksheet} disabled={editingLocked} onChange={(event) => {
            const next = Number(event.currentTarget.value);
            setWorksheet(next);
            startReview(worksheets[next].source);
          }}>
            {worksheet === -1 && <option value={-1} disabled>Choose a worksheet</option>}
            {worksheets.map(({ name, source }, index) => {
              const completed = completedWorksheets.has(index);
              return <option key={index} value={index} disabled={!source || completed}>
                {name}{completed ? ' (imported)' : source ? '' : ' (needs a header and data)'}
              </option>;
            })}
          </select>
        </label>
        {worksheets.length > 1 && <p className="form-help">Import one worksheet at a time. Switching worksheets clears this review.</p>}
      </div>}
      {source && mapping && <>
        <fieldset className="csv-mapping group-form" disabled={editingLocked}>
          <legend>Match columns</legend>
          {fields.map(({ id, label }) => (
            <label key={id}>{label}
              <select value={mapping[id]} onChange={(event) => {
                setMapping({ ...mapping, [id]: Number(event.currentTarget.value) });
                setPage(0);
                setShowProblems(false);
                setShowDuplicates(false);
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
          <p role="status">{review.length} {rowLabel}{review.length === 1 ? '' : 's'}. {problems.length > 0
            ? `${problems.length} ${problems.length === 1 ? 'needs' : 'need'} correction. Edit or remove before importing.`
            : review.length > 0 ? 'Check the rows before importing.' : 'No expenses selected.'}</p>
          {datesKey && !currentLookup && <p role="status">Checking for possible duplicates…</p>}
          {currentLookup?.matches === null && <div role="alert">
            <p>Could not check for possible duplicates.</p>
            <button type="button" className="button-secondary" onClick={() => setLookupAttempt((previous) => previous + 1)}>
              Retry duplicate check
            </button>
          </div>}
          {unresolved > 0 && <p role="status">Choose whether to keep or skip {unresolved} {unresolved === 1 ? 'possible duplicate' : 'possible duplicates'}.</p>}
          {duplicates && !expenses.length && duplicateChoices.size > 0 && <p role="status">No expenses selected for import.</p>}
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
              setShowDuplicates(false);
              setPage(0);
            }} /> Show only rows with problems
          </label>}
          {!!duplicates?.size && <label className="csv-problems">
            <input type="checkbox" checked={showDuplicates} disabled={!!editing} onChange={(event) => {
              setShowDuplicates(event.currentTarget.checked);
              setShowProblems(false);
              setPage(0);
            }} /> Show only possible duplicates
          </label>}
          <ol className="csv-rows" aria-label="Rows to review">
            {visibleRows.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((row) => {
              const duplicate = duplicates?.get(row.id);
              return (
                <li key={row.id}>
                  <strong>{row.description || 'Missing description'}</strong>
                  <span>{row.amount ? `USD ${row.amount}` : 'Missing amount'}</span>
                  <small>Row {row.number} · {row.date || 'Missing date'} · {row.category || 'Missing category'}</small>
                  {row.notes && <small className="csv-notes">{row.notes}</small>}
                  {row.problem && <p className="notice-error">{row.problem}</p>}
                  {duplicate && <>
                    <p>Possible duplicate. Same date, amount, and description as {duplicate.matchesSaved
                      ? 'a saved expense' : `${rowLabel} ${duplicate.earlierRow}`}{duplicate.matchesSaved && duplicate.earlierRow !== undefined
                        ? ` and ${rowLabel} ${duplicate.earlierRow}` : ''}.</p>
                    <div role="group" aria-label={`Possible duplicate on row ${row.number}`} className="csv-row-actions">
                      {(['keep', 'skip'] as const).map((action) => (
                        <button key={action} type="button" className="button-secondary"
                          aria-pressed={duplicateChoices.get(row.id) === action} disabled={editingLocked}
                          onClick={() => {
                            setChoices((previous) => new Map(previous).set(row.id, { key: duplicate.key, action }));
                            setError('');
                          }}>{action === 'keep' ? 'Keep' : 'Skip'}</button>
                      ))}
                    </div>
                  </>}
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
                      setShowDuplicates(false);
                      setPage(Math.floor(review.indexOf(row) / pageSize));
                      setError('');
                      closeEditor();
                    }} />}
                </li>
              );
            })}
          </ol>
          {visibleRows.length > pageSize && <div className="form-actions">
            <button className="button-secondary" disabled={!!editing || visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Previous rows</button>
            <button className="button-secondary" disabled={!!editing || (visiblePage + 1) * pageSize >= visibleRows.length}
              onClick={() => setPage(visiblePage + 1)}>Next rows</button>
            <span>Rows {visiblePage * pageSize + 1}–{Math.min((visiblePage + 1) * pageSize, visibleRows.length)} of {visibleRows.length}</span>
          </div>}
          <button type="button" disabled={saving || !canImport} onClick={() => void save()}>
            {saving ? 'Importing…' : unconfirmed ? 'Retry import' : `Import ${importCount} ${importCount === 1 ? 'expense' : 'expenses'}`}
          </button>
        </div>}
      </>}
    </section>
  );
}
