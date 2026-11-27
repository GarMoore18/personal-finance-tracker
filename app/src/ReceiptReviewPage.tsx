import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ExpenseForm } from './ExpenseForm';

const extensions = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const pageSize = 12;
const savedLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type Draft = { name: string; image: Blob; file?: File };
type StoredReceipt = { name: string; created_at: string | null };

export default function ReceiptReviewPage({ client, owner }: { client: SupabaseClient; owner: string }) {
  const [draft, setDraft] = useState<Draft>();
  const [preview, setPreview] = useState('');
  const [badImage, setBadImage] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [stored, setStored] = useState<StoredReceipt[]>();
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [savedExpense, setSavedExpense] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const expenseHeading = useRef<HTMLHeadingElement>(null);
  const expenseConfirmation = useRef<HTMLParagraphElement>(null);
  const bucket = client.storage.from('ledger-receipts');
  const image = draft?.image;

  useEffect(() => {
    if (!image) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function choose(file: File) {
    const extension = extensions.get(file.type);
    if (!extension || !file.size || file.size > 8 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image up to 8 MB.');
      return;
    }
    setBadImage(false);
    setPreviewReady(false);
    setError('');
    setStatus('');
    setDraft({ name: crypto.randomUUID() + '.' + extension, image: file, file });
  }

  async function run(label: string, failure: string, action: () => Promise<void>) {
    setOperation(label);
    setError('');
    setStatus('');
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setOperation('');
    }
  }

  async function list(nextOffset: number) {
    const { data, error } = await bucket.list(owner, {
      limit: pageSize + 1, offset: nextOffset, sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) throw error;
    setStored(data);
    setOffset(nextOffset);
  }

  function keepImage() {
    if (!draft?.file || !previewReady) return;
    const { name, file, image } = draft;
    void run('Saving image…', 'Could not save the private copy. Your preview is still here. Try again.', async () => {
      // The same object name is used when a network response goes missing.
      const { error } = await bucket.upload(owner + '/' + name, file, {
        contentType: file.type, upsert: true, cacheControl: '0',
      });
      if (error) throw error;
      setDraft({ name, image });
      setStored(undefined);
      setStatus('Image saved to your private receipts.');
    });
  }

  function openImage(name: string) {
    void run('Opening receipt…', 'Could not open the receipt. Try again.', async () => {
      const { data, error } = await bucket.download(owner + '/' + name, {}, { cache: 'no-store' });
      if (error) throw error;
      setBadImage(false);
      setPreviewReady(false);
      setDraft({ name, image: data });
    });
  }

  function removeImage() {
    if (!draft || draft.file) return;
    void run('Deleting image…', 'Could not delete the image. Try again.', async () => {
      const { error } = await bucket.remove([owner + '/' + draft.name]);
      if (error) throw error;
      setDeleting(false);
      setDraft(undefined);
      setStored(undefined);
      setStatus('Receipt image deleted.');
    });
  }

  return (
    <div className="receipt-review">
      <section className="panel receipt-image" aria-label="Receipt image">
        <label className="csv-file">Receipt image
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!operation || deleting}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) choose(file);
            }} />
        </label>
        <p className="form-help">Choose a JPEG, PNG, or WebP up to 8 MB.</p>
        {preview && !badImage && <img key={preview} src={preview} alt="Receipt for manual review"
          onLoad={() => setPreviewReady(true)}
          onError={() => {
            setBadImage(true);
            setError('Could not display this image. Choose another receipt.');
          }} />}
        {draft && <div className="form-actions">
          {previewReady && preview && !badImage && <a className="action" href={preview} target="_blank" rel="noreferrer">Open full image</a>}
          {draft.file ? <button type="button" className="button-secondary" disabled={!previewReady || !!operation}
            onClick={keepImage}>Save private copy</button>
            : <button type="button" className="button-secondary" disabled={!!operation || deleting}
              onClick={() => setDeleting(true)}>Delete saved image</button>}
        </div>}
        {deleting && <div className="receipt-delete">
          <p>Delete this saved receipt image?</p>
          <div className="form-actions">
            <button type="button" disabled={!!operation} onClick={removeImage}>Delete image</button>
            <button type="button" className="button-secondary" disabled={!!operation}
              onClick={() => setDeleting(false)}>Keep image</button>
          </div>
        </div>}
        <button type="button" className="button-secondary" disabled={!!operation || deleting}
          onClick={() => void run('Loading receipts…', 'Could not load saved receipts. Try again.', () => list(0))}>
          Show saved receipts
        </button>
        {stored && (stored.length ? <>
          <ul className="receipt-list">
            {stored.slice(0, pageSize).map(({ name, created_at }) => <li key={name}>
              <button type="button" className="text-button" disabled={!!operation || deleting}
                onClick={() => openImage(name)}>Open receipt · {created_at ? savedLabel.format(new Date(created_at)) : name}</button>
            </li>)}
          </ul>
          {(offset > 0 || stored.length > pageSize) && <div className="form-actions">
            <button type="button" className="button-secondary" disabled={!offset || !!operation || deleting}
              onClick={() => void run('Loading receipts…', 'Could not load saved receipts. Try again.', () => list(offset - pageSize))}>Previous receipts</button>
            <button type="button" className="button-secondary" disabled={stored.length <= pageSize || !!operation || deleting}
              onClick={() => void run('Loading receipts…', 'Could not load saved receipts. Try again.', () => list(offset + pageSize))}>Next receipts</button>
          </div>}
        </> : <p className="form-help">No saved receipt images.</p>)}
        {error && <p className="notice-error" role="alert">{error}</p>}
        <span role="status">{operation || status}</span>
      </section>
      <section className="receipt-expense" aria-labelledby="receipt-expense-heading">
        <h2 id="receipt-expense-heading" tabIndex={-1} ref={expenseHeading}>Enter expense details</h2>
        <p className="form-help">Enter the receipt details yourself. Saved images are managed separately from expenses.</p>
        {savedExpense ? <>
          <p role="status" tabIndex={-1} ref={expenseConfirmation}>Expense saved. <a href="#/activity">View Activity</a></p>
          <button type="button" className="button-secondary" onClick={() => {
            setSavedExpense(false);
            requestAnimationFrame(() => expenseHeading.current?.focus());
          }}>Enter another expense</button>
        </> : reviewing ? <ExpenseForm client={client} onSaved={() => {
          setSavedExpense(true);
          requestAnimationFrame(() => expenseConfirmation.current?.focus());
        }} /> : <button type="button" disabled={!previewReady || !draft} onClick={() => {
          setReviewing(true);
          requestAnimationFrame(() => expenseHeading.current?.focus());
        }}>Start expense</button>}
      </section>
    </div>
  );
}
