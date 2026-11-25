create schema ledger_private;
revoke all on schema ledger_private from public, anon, authenticated;

create domain public.usd_amount as numeric
  check (value between -999999999999.99 and 999999999999.99 and scale(value) <= 2);

create table public.account_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid,
  name text not null check (btrim(name) <> ''),
  kind text not null check (kind in ('asset', 'liability')),
  current_balance public.usd_amount not null,
  balance_observed_on date not null check (isfinite(balance_observed_on)),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, group_id) references public.account_groups (user_id, id)
);

create table public.balance_snapshots (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  month date not null check (isfinite(month) and extract(day from month) = 1),
  balance public.usd_amount not null,
  observed_on date not null check (isfinite(observed_on)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id, month),
  foreign key (user_id, account_id) references public.accounts (user_id, id),
  check (month = make_date(extract(year from observed_on)::integer, extract(month from observed_on)::integer, 1))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null check (btrim(icon) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  occurred_on date not null check (isfinite(occurred_on)),
  amount public.usd_amount not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.categories (user_id, id)
);

create index accounts_group_idx on public.accounts (user_id, group_id);
create index transactions_category_idx on public.transactions (user_id, category_id);
create index transactions_activity_idx on public.transactions (user_id, occurred_on desc, id);

create function ledger_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function ledger_private.touch_updated_at() from public, anon, authenticated;

-- Snapshot rows are writable only through this trigger on an authorized account write.
create function ledger_private.record_balance_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.balance_observed_on < old.balance_observed_on then
      raise exception 'A balance observation cannot precede the current observation' using errcode = '23514';
    end if;
    if new.balance_observed_on = old.balance_observed_on and new.current_balance = old.current_balance then
      return new;
    end if;
  end if;

  insert into public.balance_snapshots (user_id, account_id, month, balance, observed_on)
  values (
    new.user_id, new.id,
    make_date(extract(year from new.balance_observed_on)::integer, extract(month from new.balance_observed_on)::integer, 1),
    new.current_balance, new.balance_observed_on
  )
  on conflict (user_id, account_id, month) do update
  set balance = excluded.balance, observed_on = excluded.observed_on, updated_at = now();
  return new;
end;
$$;
revoke all on function ledger_private.record_balance_snapshot() from public, anon, authenticated;

create trigger account_balance_snapshot
  after insert or update of current_balance, balance_observed_on on public.accounts
  for each row execute function ledger_private.record_balance_snapshot();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['account_groups', 'accounts', 'balance_snapshots', 'categories', 'transactions']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      table_name
    );
    if table_name <> 'balance_snapshots' then
      execute format(
        'create trigger touch_updated_at before update on public.%I for each row execute function ledger_private.touch_updated_at()',
        table_name
      );
    end if;
  end loop;
end;
$$;

grant insert (id, name, sort_order), update (name, sort_order) on public.account_groups to authenticated;
grant insert (id, group_id, name, kind, current_balance, balance_observed_on),
  update (group_id, name, current_balance, balance_observed_on, archived_at) on public.accounts to authenticated;
grant insert (id, name, color, icon, sort_order), update (name, color, icon, sort_order) on public.categories to authenticated;
grant insert (id, category_id, occurred_on, amount, description, notes),
  update (category_id, occurred_on, amount, description, notes) on public.transactions to authenticated;
grant delete on public.account_groups, public.categories, public.transactions to authenticated;
