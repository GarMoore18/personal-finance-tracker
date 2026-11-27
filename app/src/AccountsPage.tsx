import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localToday, normalizeUsdAmount } from './financialInputs';
import { formatUsd, toCents } from './money';

type AccountKind = 'asset' | 'liability';
type Group = { id: string; name: string; sort_order: number };
type Snapshot = { account_id: string; month: string; balance: string | number; observed_on: string };
type Account = {
  id: string;
  group_id: string | null;
  name: string;
  kind: AccountKind;
  current_balance: string | number;
  balance_observed_on: string;
  archived_at: string | null;
};
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}
function formatMonth(month: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + 'T00:00:00Z'));
}
function AccountManager({ client }: { client: SupabaseClient }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [balanceForm, setBalanceForm] = useState<Account | null>(null);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
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
    const [groupResult, accountResult, snapshotResult] = await Promise.all([
      client.from('account_groups').select('id,name,sort_order').order('sort_order').order('name'),
      client.from('accounts').select('id,group_id,name,kind,current_balance,balance_observed_on,archived_at').order('name'),
      client.from('balance_snapshots').select('account_id,month,balance,observed_on').order('month', { ascending: false }),
    ]);
    if (groupResult.error || accountResult.error || snapshotResult.error) {
      setLoadError('Could not load accounts. Check your connection and try again.');
    } else {
      setGroups((groupResult.data ?? []) as Group[]);
      setAccounts((accountResult.data ?? []) as Account[]);
      setSnapshots((snapshotResult.data ?? []) as Snapshot[]);
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, [client]);

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('group-name') ?? '').trim();
    if (!name) {
      setFormError('Enter a group name.');
      event.currentTarget.querySelector<HTMLInputElement>('[name="group-name"]')?.focus();
      return;
    }
    setSaving(true); setFormError(''); setMessage('');
    const id = editingGroup;
    const result = id
      ? await client.from('account_groups').update({ name }).eq('id', id).select('id').maybeSingle()
      : await client.from('account_groups').insert({ name });
    setSaving(false);
    if (result.error || (id && !result.data)) { setFormError('Could not save this group. Your entries are still here.'); return; }
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
    const startingBalance = accountForm === 'create' ? normalizeUsdAmount(String(form.get('starting-balance') ?? '')) : null;
    if (!name) {
      setFormError('Enter an account name.');
      event.currentTarget.querySelector<HTMLInputElement>('[name="account-name"]')?.focus();
      return;
    }
    if (accountForm === 'create' && startingBalance === null) {
      setFormError('Enter a balance with no more than two decimal places.');
      return;
    }
    const values = { name, group_id: group || null };
    setSaving(true); setFormError(''); setMessage('');
    const editing = accountForm && accountForm !== 'create' ? accountForm : null;
    const result = editing
      ? await client.from('accounts').update(values).eq('id', editing.id).select('id').maybeSingle()
      : await client.from('accounts').insert({
          ...values,
          kind,
          current_balance: startingBalance!,
          balance_observed_on: String(form.get('observed-on')),
        });
    setSaving(false);
    if (result.error || (editing && !result.data)) { setFormError('Could not save this account. Your entries are still here.'); return; }
    setMessage(editing ? 'Account updated.' : 'Account created with its starting balance.');
    setAccountForm(null);
    await load();
  }

  async function submitBalance(event: FormEvent<HTMLFormElement>, account: Account) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const balance = normalizeUsdAmount(String(form.get('balance') ?? ''));
    const observedOn = String(form.get('observed-on') ?? '');
    if (balance === null) {
      setFormError('Enter a balance with no more than two decimal places.');
      return;
    }
    if (!observedOn) {
      setFormError('Choose the date this balance was observed.');
      return;
    }
    if (observedOn < account.balance_observed_on) {
      setFormError(`Choose a date on or after ${account.balance_observed_on} to keep the current balance up to date.`);
      return;
    }
    setSaving(true); setFormError(''); setMessage('');
    const result = await client.from('accounts').update({ current_balance: balance, balance_observed_on: observedOn })
      .eq('id', account.id).select('id').maybeSingle();
    setSaving(false);
    if (result.error || !result.data) { setFormError('Could not save this balance. Your entries are still here.'); return; }
    setBalanceForm(null);
    setMessage('Balance saved. This month’s snapshot now shows the latest observation; earlier months are kept.');
    await load();
  }

  function historyPanel(account: Account) {
    const rows = snapshots.filter(({ account_id }) => account_id === account.id);
    const expanded = !!openHistory[account.id];
    return <div className="balance-history">
      <button className="text-button" type="button" aria-expanded={expanded} onClick={() => setOpenHistory((current) => ({ ...current, [account.id]: !current[account.id] }))}>
        {expanded ? 'Hide monthly history' : 'View monthly history'}
      </button>
      {expanded && (rows.length ? <ul aria-label={'Monthly balance history for ' + account.name} className="snapshot-list">
        {rows.map((snapshot) => <li className="snapshot-row" key={snapshot.month}><span>{formatMonth(snapshot.month)} <small>Observed {snapshot.observed_on}</small></span><strong>{formatUsd(toCents(snapshot.balance))}</strong></li>)}
      </ul> : <p className="empty-hint">No monthly balance history yet. Record a balance to start tracking.</p>)}
    </div>;
  }

  async function toggleArchive(account: Account) {
    if (saving) return;
    setSaving(true); setMessage(''); setFormError('');
    const result = await client.from('accounts').update({ archived_at: account.archived_at ? null : new Date().toISOString() })
      .eq('id', account.id).select('id').maybeSingle();
    setSaving(false);
    setConfirmArchive(null);
    if (result.error || !result.data) { setFormError('Could not update this account. Try again.'); return; }
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
            <div className="form-actions"><button type="submit" disabled={saving}>Save changes</button><button className="button-secondary" type="button" onClick={() => setAccountForm(null)}>Cancel</button></div>
          </form>
        ) : (
          <>
            <div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatUsd(toCents(account.current_balance))} · As of {account.balance_observed_on}</span></div>
            {balanceForm?.id === account.id && <form className="balance-form" onSubmit={(event) => void submitBalance(event, account)}>
              <label>Current balance<input name="balance" type="text" inputMode="decimal" autoComplete="off" defaultValue={account.current_balance} required /></label>
              <label>Balance observed on<input name="observed-on" type="date" defaultValue={account.balance_observed_on} required /></label>
              <p className="form-help">A new month adds a snapshot. Changes within the same month replace that month’s snapshot.</p>
              <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save balance'}</button><button className="button-secondary" type="button" onClick={() => setBalanceForm(null)}>Cancel</button></div>
            </form>}
            {historyPanel(account)}
            {confirmArchive === account.id ? (
              <div className="archive-confirm" role="group" aria-label={'Confirm archive ' + account.name}>
                <span>Archive {account.name}? Its history will be kept.</span>
                <button type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Confirm archive</button>
                <button className="button-secondary" type="button" onClick={() => setConfirmArchive(null)}>Cancel</button>
              </div>
            ) : (
              <div className="account-actions">
                <button className="button-secondary" type="button" aria-label={'Record balance for ' + account.name} onClick={() => { setFormError(''); setMessage(''); setBalanceForm(balanceForm?.id === account.id ? null : account); }}>Update balance</button>
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
            <label>Starting balance<input name="starting-balance" type="text" inputMode="decimal" autoComplete="off" defaultValue="0.00" required /></label>
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
          {archivedAccounts.length > 0 && <section className="account-group panel" aria-labelledby="archived-heading"><h3 id="archived-heading">Archived accounts</h3><ul className="account-list">{archivedAccounts.map((account) => <li className="account-row" key={account.id}><div className="account-info"><strong>{account.name}</strong><span className="account-meta">{account.kind === 'asset' ? 'Asset' : 'Liability'} · {formatUsd(toCents(account.current_balance))} · As of {account.balance_observed_on}</span></div>{historyPanel(account)}<button className="button-secondary" type="button" disabled={saving} onClick={() => void toggleArchive(account)}>Restore</button></li>)}</ul></section>}
        </>
      )}
    </div>
  );
}

export function AccountsPage({ client }: { client: SupabaseClient }) {
  return <AccountManager client={client} />;
}
