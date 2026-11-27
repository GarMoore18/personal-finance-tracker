-- Run against an empty development database with psql -v ON_ERROR_STOP=1.
begin;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

insert into public.account_groups (id, name) values ('10000000-0000-4000-8000-000000000001', 'Banking');
insert into public.accounts (id, group_id, name, kind, current_balance, balance_observed_on)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Checking', 'asset', 1200.00, '2026-11-24');

update public.accounts set current_balance = 1100.00, balance_observed_on = '2026-11-27';
update public.accounts set current_balance = 1250.00, balance_observed_on = '2026-12-02';

insert into public.categories (id, name, color, icon)
values ('30000000-0000-4000-8000-000000000001', 'Test groceries', '#32734a', 'basket');
insert into public.transactions (id, category_id, occurred_on, amount, description)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '2026-11-24', 42.50, 'Test groceries');

do $$
begin
  if (select current_balance from public.accounts) is distinct from 1250.00::numeric
    or (select count(*) from public.balance_snapshots) <> 2
    or (select balance from public.balance_snapshots where month = '2026-11-01') is distinct from 1100.00::numeric then
    raise exception 'Current balance and monthly history must remain independent of expenses';
  end if;

  begin
    update public.accounts set balance_observed_on = '2026-12-01';
    raise exception 'An older observation was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.balance_snapshots set balance = 99.99;
    raise exception 'Direct snapshot changes were accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.transactions set amount = 42.501;
    raise exception 'Extra decimal precision was accepted';
  exception when check_violation then null;
  end;

  update public.transactions
  set amount = 43.25, occurred_on = '2026-11-25', description = 'Updated groceries', notes = 'Test note'
  where id = '40000000-0000-4000-8000-000000000001';
  if not exists (
    select 1 from public.transactions
    where id = '40000000-0000-4000-8000-000000000001'
      and category_id = '30000000-0000-4000-8000-000000000001'
      and amount = 43.25
      and occurred_on = '2026-11-25'
      and description = 'Updated groceries'
      and notes = 'Test note'
  ) then
    raise exception 'The owner could not persist and read back an expense update';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.accounts)
    or exists (select 1 from public.account_groups)
    or exists (select 1 from public.balance_snapshots)
    or exists (select 1 from public.categories where id = '30000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.transactions) then
    raise exception 'Owner isolation failed';
  end if;

  update public.accounts set name = 'Changed by another user';
  if found then
    raise exception 'Another user updated an account';
  end if;

  update public.transactions set description = 'Changed by another user'
  where id = '40000000-0000-4000-8000-000000000001';
  if found then
    raise exception 'Another user updated an expense';
  end if;

  delete from public.transactions where id = '40000000-0000-4000-8000-000000000001';
  if found then
    raise exception 'Another user deleted an expense';
  end if;

  begin
    insert into public.transactions (category_id, occurred_on, amount, description)
    values ('30000000-0000-4000-8000-000000000001', '2026-11-24', 1.00, 'Wrong owner');
    raise exception 'A cross-owner category reference was accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.accounts (group_id, name, kind, current_balance, balance_observed_on)
    values ('10000000-0000-4000-8000-000000000001', 'Wrong owner', 'asset', 1.00, '2026-11-24');
    raise exception 'A cross-owner group reference was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
begin
  delete from public.transactions where id = '40000000-0000-4000-8000-000000000001';
  if not found or exists (select 1 from public.transactions) then
    raise exception 'The owner could not delete the expense';
  end if;

  if (select current_balance from public.accounts) is distinct from 1250.00::numeric
    or (select balance from public.balance_snapshots where month = '2026-11-01') is distinct from 1100.00::numeric
    or (select balance from public.balance_snapshots where month = '2026-12-01') is distinct from 1250.00::numeric
    or (select count(*) from public.balance_snapshots) <> 2 then
    raise exception 'Editing or deleting an expense affected current balances or history';
  end if;
end $$;

set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.transactions', 'select')
    or has_any_column_privilege('anon', 'public.transactions', 'insert') then
    raise exception 'Unauthenticated users have access to expenses';
  end if;
end $$;

rollback;
