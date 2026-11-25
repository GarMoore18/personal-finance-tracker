begin;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000005'), ('00000000-0000-4000-8000-000000000006');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);

insert into public.account_groups (id, name) values ('10000000-0000-4000-8000-000000000005', 'Banking');
insert into public.accounts (group_id, name, kind, current_balance, balance_observed_on) values
  ('10000000-0000-4000-8000-000000000005', 'Checking', 'asset', 1200.10, '2026-11-24'),
  ('10000000-0000-4000-8000-000000000005', 'Savings', 'asset', 800.20, '2026-11-24'),
  (null, 'Credit card', 'liability', 300.30, '2026-11-24'),
  (null, 'Loan', 'liability', 100.00, '2026-11-24'),
  (null, 'Card credit', 'liability', -10.00, '2026-11-24'),
  (null, 'Overdrawn account', 'asset', -25.00, '2026-11-24'),
  (null, 'Closed savings', 'asset', 400.00, '2026-11-24');
update public.accounts set archived_at = now() where name = 'Closed savings';

do $$
begin
  if (select assets from public.current_net_worth) is distinct from '1975.30'
    or (select liabilities from public.current_net_worth) is distinct from '390.30'
    or (select net_worth from public.current_net_worth) is distinct from '1585.00' then
    raise exception 'Net worth must use each active account once and subtract liabilities';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$
begin
  if exists (select 1 from public.current_net_worth) then
    raise exception 'Another owner or an empty portfolio must not return a row';
  end if;
end $$;

rollback;
