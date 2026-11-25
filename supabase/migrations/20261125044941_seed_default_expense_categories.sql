create function ledger_private.seed_expense_categories(owner_id uuid)
returns void language sql set search_path = '' as $$
  insert into public.categories (user_id, name, color, icon, sort_order)
  select owner_id, defaults.name, defaults.color, defaults.icon, defaults.sort_order
  from (values
    ('Groceries',        '#527435', 'basket',    10),
    ('Dining out',       '#9F3D3F', 'utensils',  20),
    ('Rent / Mortgage',  '#386641', 'home',      30),
    ('Utilities',        '#386970', 'plug',      40),
    ('Transport',        '#25647E', 'bus',       50),
    ('Gas',              '#4B667F', 'fuel',      60),
    ('Health',           '#A62A3C', 'heart',     70),
    ('Shopping',         '#734A9E', 'bag',       80),
    ('Entertainment',    '#9E4B24', 'ticket',    90),
    ('Subscriptions',    '#8A541A', 'repeat',   100),
    ('Travel',           '#33766B', 'plane',    110),
    ('Other',            '#596879', 'ellipsis', 120)
  ) as defaults(name, color, icon, sort_order)
  where not exists (
    select 1 from public.categories as existing
    where existing.user_id = owner_id and lower(btrim(existing.name)) = lower(defaults.name)
  );
$$;
revoke all on function ledger_private.seed_expense_categories(uuid) from public, anon, authenticated;

create function ledger_private.seed_categories_for_new_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform ledger_private.seed_expense_categories(new.id);
  return new;
end;
$$;
revoke all on function ledger_private.seed_categories_for_new_owner() from public, anon, authenticated;

create trigger seed_ledger_categories
  after insert on auth.users
  for each row execute function ledger_private.seed_categories_for_new_owner();

select ledger_private.seed_expense_categories(id) from auth.users;
