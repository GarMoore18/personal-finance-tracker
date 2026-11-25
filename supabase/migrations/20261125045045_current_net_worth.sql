create view public.current_net_worth with (security_invoker = true) as
with totals as (
  select
    user_id,
    coalesce(sum(current_balance) filter (where kind = 'asset'), 0) as assets,
    coalesce(sum(current_balance) filter (where kind = 'liability'), 0) as liabilities
  from public.accounts
  where archived_at is null
  group by user_id
)
select
  user_id,
  assets::text as assets,
  liabilities::text as liabilities,
  (assets - liabilities)::text as net_worth
from totals;

revoke all on table public.current_net_worth from public, anon, authenticated;
grant select on table public.current_net_worth to authenticated;

comment on view public.current_net_worth is
  'Active-account net worth per owner. Exact USD amounts are returned as decimal strings for browser clients.';
