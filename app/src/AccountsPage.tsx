import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type AccountKind = 'asset' | 'liability';
type Group = { id: string; name: string; sort_order: number };
type Account = {
  id: string;
  group_id: string | null;
  name: string;
  kind: AccountKind;
  current_balance: string;
  balance_observed_on: string;
  archived_at: string | null;
};
function localToday() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}
function formatBalance(value: string) {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  let grouped = '';
  for (let index = 0; index < whole.length; index += 1) {
    if (index > 0 && (whole.length - index) % 3 === 0) grouped += ',';
    grouped += whole[index];
  }
  return (negative ? '-$' : '$') + grouped + '.' + fraction.padEnd(2, '0').slice(0, 2);
}
function normalizeBalance(value: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '');
  if (whole.length > 12 || (whole.length === 12 && whole > '999999999999')) return null;
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const negative = match[1] && (whole !== '0' || fraction !== '00') ? '-' : '';
  return negative + whole + '.' + fraction;
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
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

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
    const startingBalance = accountForm === 'create' ? normalizeBalance(String(form.get('starting-balance') ?? '')) : null;
    if (!name) return;
    if (accountForm === 'create' && startingBalance === null) {
      setFormError('Enter a balance with no more than two decimal places.');
      return;
    }
    const values = { name, group_id: group || null, kind };
    setSaving(true); setFormError(''); setMessage('');
    const editing = accountForm && accountForm !== 'create' ? accountForm : null;
    const result = editing
      ? await client.from('accounts').update(values).eq('id', editing.id)
      : await client.from('accounts').insert({
          ...values,
          current_balance: startingBalance!,
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
    setConfirmArchive(null);
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
            <div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatBalance(account.current_balance)}</span></div>
            {confirmArchive === account.id ? (
              <div className="archive-confirm" role="group" aria-label={'Confirm archive ' + account.name}>
                <span>Archive {account.name}? Its history will be kept.</span>
                <button type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Confirm archive</button>
                <button className="button-secondary" type="button" onClick={() => setConfirmArchive(null)}>Cancel</button>
              </div>
            ) : (
              <div className="account-actions">
                <button className="button-secondary" type="button" aria-label={'Edit ' + account.name} onClick={() => { setFormError(''); setAccountForm(account); }}>Edit</button>
                <button className="button-secondary" type="button" disabled={saving} aria-label={'Archive ' + account.name} onClick={() => setConfirmArchive(account.id)}>Archive</button>
              </div>
            )}
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
          {archivedAccounts.length > 0 && <section className="account-group panel" aria-labelledby="archived-heading"><h3 id="archived-heading">Archived accounts</h3><ul className="account-list">{archivedAccounts.map((account) => <li className="account-row" key={account.id}><div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatBalance(account.current_balance)}</span></div><button className="button-secondary" type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Restore</button></li>)}</ul></section>}
        </>
      )}
    </div>
  );
}

export function AccountsPage({ client }: { client: SupabaseClient }) {
  return <AccountManager client={client} />;
}
