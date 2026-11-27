\set ON_ERROR_STOP on

begin;
lock table public.account_groups, public.accounts, public.balance_snapshots,
  public.categories, public.transactions in share row exclusive mode;

select set_config('ledger.restore_owner', :'owner_id', true);

do $$
declare
  owner_id uuid := current_setting('ledger.restore_owner')::uuid;
begin
  if (select count(*) from auth.users) <> 1
    or not exists (select 1 from auth.users where id = owner_id) then
    raise exception 'Restore requires a fresh project with the matching owner UUID';
  end if;
  if exists (select 1 from public.account_groups)
    or exists (select 1 from public.accounts)
    or exists (select 1 from public.balance_snapshots)
    or exists (select 1 from public.transactions)
    or (select count(*) from public.categories) <> 12
    or exists (select 1 from public.categories where updated_at <> created_at or user_id <> owner_id) then
    raise exception 'Restore requires an empty Ledger database with untouched seeded categories';
  end if;
end $$;

-- Use the category IDs and monthly snapshots in the backup.
delete from public.categories;
alter table public.accounts disable trigger account_balance_snapshot;
\i :backup_file
alter table public.accounts enable trigger account_balance_snapshot;
commit;
