import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const pages = [
  { id: 'home', label: 'Home', heading: 'Home' },
  { id: 'activity', label: 'Activity', heading: 'Activity' },
  { id: 'add', label: 'Add', heading: 'Add expense' },
  { id: 'accounts', label: 'Accounts', heading: 'Accounts' },
  { id: 'more', label: 'More', heading: 'Settings' },
] as const;

const themes = ['system', 'light', 'dark'] as const;
type Theme = (typeof themes)[number];
type Page = (typeof pages)[number];
type AccountKind = 'asset' | 'liability';
type Group = { id: string; name: string; sort_order: number };
type Account = {
  id: string;
  group_id: string | null;
  name: string;
  kind: AccountKind;
  current_balance: number;
  balance_observed_on: string;
  archived_at: string | null;
};
const appearanceKey = 'ledger-app:appearance';

function currentPage(): Page {
  return pages.find(({ id }) => location.hash === '#/' + id) ?? pages[0];
}
function initialTheme(): Theme {
  try {
    const preference = localStorage.getItem(appearanceKey);
    return themes.find((theme) => theme === preference) ?? 'system';
  } catch {
    return 'system';
  }
}
function localToday() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}
function formatBalance(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
}

function AccountManager({ client }: { client: SupabaseClient }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [accountForm, setAccountForm] = useState<'create' | Account | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError('');
    const [groupResult, accountResult] = await Promise.all([
      client.from('account_groups').select('id,name,sort_order').order('sort_order').order('name'),
      client.from('accounts').select('id,group_id,name,kind,current_balance,balance_observed_on,archived_at').order('name'),
    ]);
    if (groupResult.error || accountResult.error) {
      setLoadError('Could not load accounts. Check your connection and try again.');
    } else {
      setGroups((groupResult.data ?? []) as Group[]);
      setAccounts((accountResult.data ?? []) as Account[]);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [client]);

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('group-name') ?? '').trim();
    if (!name) return;
    setSaving(true); setFormError(''); setMessage('');
    const id = editingGroup;
    const result = id
      ? await client.from('account_groups').update({ name }).eq('id', id)
      : await client.from('account_groups').insert({ name });
    setSaving(false);
    if (result.error) { setFormError('Could not save this group. Try again.'); return; }
    setMessage(id ? 'Group renamed.' : 'Group created.');
    setEditingGroup(null); setShowGroupForm(false);
    await load();
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('account-name') ?? '').trim();
    const group = String(form.get('group-id') ?? '');
    const kind = String(form.get('kind') ?? '') as AccountKind;
    if (!name) return;
    const values = { name, group_id: group || null, kind };
    setSaving(true); setFormError(''); setMessage('');
    const editing = accountForm && accountForm !== 'create' ? accountForm : null;
    const result = editing
      ? await client.from('accounts').update(values).eq('id', editing.id)
      : await client.from('accounts').insert({
          ...values,
          current_balance: Number(form.get('starting-balance')),
          balance_observed_on: String(form.get('observed-on')),
        });
    setSaving(false);
    if (result.error) { setFormError('Could not save this account. Check the details and try again.'); return; }
    setMessage(editing ? 'Account updated.' : 'Account created with its starting balance.');
    setAccountForm(null);
    await load();
  }

  async function toggleArchive(account: Account) {
    if (saving) return;
    setSaving(true); setMessage(''); setFormError('');
    const result = await client.from('accounts').update({ archived_at: account.archived_at ? null : new Date().toISOString() }).eq('id', account.id);
    setSaving(false);
    if (result.error) { setFormError('Could not update this account. Try again.'); return; }
    setMessage(account.archived_at ? 'Account restored.' : 'Account archived. Its history is retained.');
    await load();
  }

  const activeAccounts = accounts.filter(({ archived_at }) => !archived_at);
  const archivedAccounts = accounts.filter(({ archived_at }) => !!archived_at);
  const ungrouped = activeAccounts.filter(({ group_id }) => !group_id || !groups.some((group) => group.id === group_id));
  function accountRows(rows: Account[]) {
    return rows.length ? <ul className="account-list">{rows.map((account) => (
      <li className="account-row" key={account.id}>
        {accountForm && typeof accountForm !== 'string' && accountForm.id === account.id ? (
          <form className="account-form account-edit-form" onSubmit={submitAccount}>
            <label>Account name<input name="account-name" defaultValue={account.name} required maxLength={100} /></label>
            <label>Group<select name="group-id" defaultValue={account.group_id ?? ''}><option value="">Ungrouped</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label>Classification<select name="kind" defaultValue={account.kind}><option value="asset">Asset</option><option value="liability">Liability</option></select></label>
            <div className="form-actions"><button type="submit" disabled={saving}>Save changes</button><button className="button-secondary" type="button" onClick={() => setAccountForm(null)}>Cancel</button></div>
          </form>
        ) : (
          <>
            <div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatBalance(Number(account.current_balance))}</span></div>
            <div className="account-actions"><button className="button-secondary" type="button" aria-label={'Edit ' + account.name} onClick={() => { setFormError(''); setAccountForm(account); }}>Edit</button><button className="button-secondary" type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Archive</button></div>
          </>
        )}
      </li>
    ))}</ul> : <p className="empty-hint">No accounts here yet.</p>;
  }

  return (
    <div className="account-manager">
      <div className="account-toolbar"><p>Keep your accounts organized and up to date.</p><button type="button" onClick={() => { setAccountForm('create'); setFormError(''); setMessage(''); }}>Add account</button></div>
      {message && <p className="notice-success" role="status">{message}</p>}
      {formError && <p className="notice-error" role="alert">{formError}</p>}
      {loading ? <p role="status">Loading accounts…</p> : loadError ? <div className="notice-error" role="alert"><p>{loadError}</p><button className="button-secondary" type="button" onClick={() => void load()}>Retry</button></div> : (
        <>
          {accountForm === 'create' && <Panel title="New account"><form className="account-form" onSubmit={submitAccount}>
            <label>Account name<input name="account-name" autoFocus required maxLength={100} placeholder="e.g. Everyday checking" /></label>
            <label>Group<select name="group-id" defaultValue=""><option value="">Ungrouped</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label>Classification<select name="kind" defaultValue="asset"><option value="asset">Asset</option><option value="liability">Liability</option></select></label>
            <label>Starting balance<input name="starting-balance" type="number" min="-999999999999.99" max="999999999999.99" step="0.01" defaultValue="0.00" required /></label>
            <label>Balance observed on<input name="observed-on" type="date" defaultValue={localToday()} required /></label>
            <p className="form-help">This starting value is saved as the first balance observation.</p>
            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create account'}</button><button className="button-secondary" type="button" onClick={() => setAccountForm(null)}>Cancel</button></div>
          </form></Panel>}
          {showGroupForm && <Panel title="New group"><form className="group-form" onSubmit={submitGroup}><label>Group name<input name="group-name" autoFocus required maxLength={80} placeholder="e.g. Banking" /></label><div className="form-actions"><button type="submit" disabled={saving}>Create group</button><button className="button-secondary" type="button" onClick={() => setShowGroupForm(false)}>Cancel</button></div></form></Panel>}
          <div className="group-heading"><h2>Groups</h2><button className="button-secondary" type="button" onClick={() => { setShowGroupForm(true); setEditingGroup(null); }}>Add group</button></div>
          {groups.map((group) => {
            const rows = activeAccounts.filter(({ group_id }) => group_id === group.id);
            return <section className="account-group panel" key={group.id} aria-labelledby={'group-' + group.id}>
              <div className="group-title"><h3 id={'group-' + group.id}>{group.name}</h3><button className="text-button" type="button" onClick={() => { setEditingGroup(group.id); setShowGroupForm(false); }}>Rename</button></div>
              {editingGroup === group.id && <form className="group-form" onSubmit={submitGroup}><label htmlFor={'rename-' + group.id}>Group name</label><input id={'rename-' + group.id} name="group-name" defaultValue={group.name} autoFocus required maxLength={80} /><div className="form-actions"><button type="submit" disabled={saving}>Save group</button><button className="button-secondary" type="button" onClick={() => setEditingGroup(null)}>Cancel</button></div></form>}
              {accountRows(rows)}
            </section>;
          })}
          <section className="account-group panel" aria-labelledby="ungrouped-heading"><h3 id="ungrouped-heading">Ungrouped</h3>{accountRows(ungrouped)}</section>
          {activeAccounts.length === 0 && groups.length === 0 && <div className="empty-state"><h2>No accounts yet</h2><p>Create a group or add your first account.</p></div>}
          {archivedAccounts.length > 0 && <section className="account-group panel" aria-labelledby="archived-heading"><h3 id="archived-heading">Archived accounts</h3><ul className="account-list">{archivedAccounts.map((account) => <li className="account-row" key={account.id}><div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatBalance(Number(account.current_balance))}</span></div><button className="button-secondary" type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Restore</button></li>)}</ul></section>}
        </>
      )}
    </div>
  );
}

export function App({ signOut, client }: { signOut: ReactNode; client: SupabaseClient }) {
  const [page, setPage] = useState(currentPage);
  const [theme, setTheme] = useState(initialTheme);
  const main = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    function navigate() { setPage(currentPage()); }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title = page.heading + ' | Ledger';
    if (previousPage.current !== page) { main.current?.focus(); window.scrollTo(0, 0); previousPage.current = page; }
  }, [page]);
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    try { localStorage.setItem(appearanceKey, nextTheme); } catch { /* Keep this page's preference. */ }
  }
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
      <header className="sidebar">
        <a className="brand" href="#/home">Ledger</a>
        <nav aria-label="Main navigation">{pages.map(({ id, label }) => <a key={id} href={'#/' + id} aria-current={page.id === id ? 'page' : undefined} className={id === 'add' ? 'nav-add' : undefined}>{label}</a>)}</nav>
      </header>
      <main id="main-content" ref={main} tabIndex={-1}>
        <h1>{page.heading}</h1>
        {page.id === 'home' && <div className="panel-grid"><Panel title="Spending"><p>Monthly spending will appear here after you add expenses.</p><a className="action" href="#/add">Add an expense</a></Panel><Panel title="Net worth"><p>Net worth will appear here when account balances are available.</p><a className="action" href="#/accounts">View accounts</a></Panel></div>}
        {page.id === 'activity' && <Panel title="Expense history"><p>No expenses to show yet.</p><a className="action" href="#/add">Add an expense</a></Panel>}
        {page.id === 'add' && <p>Expense entry is coming in a later update.</p>}
        {page.id === 'accounts' && <AccountManager client={client} />}
        {page.id === 'more' && <><fieldset className="panel appearance"><legend>Appearance</legend>{themes.map((option) => <label key={option}><input type="radio" name="appearance" value={option} checked={theme === option} onChange={() => changeTheme(option)} />{option}</label>)}</fieldset>{signOut}</>}
      </main>
    </div>
  );
}
