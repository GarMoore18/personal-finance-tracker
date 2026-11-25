begin;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000003'), ('00000000-0000-4000-8000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);

do $$
declare
  groceries uuid;
begin
  if (select count(*) from public.categories) <> 12 then
    raise exception 'The first owner must have exactly one default set';
  end if;

  select id into strict groceries from public.categories where name = 'Groceries';
  insert into public.transactions (category_id, occurred_on, amount, description)
  values (groceries, '2026-11-24', 42.50, 'Grocery shop');

  update public.categories set name = 'Food at home', color = '#356643', icon = 'apple'
  where id = groceries;
  if (select category_id from public.transactions) is distinct from groceries then
    raise exception 'Editing a default category broke the expense reference';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$
begin
  if (select count(*) from public.categories) <> 12
    or not exists (select 1 from public.categories where name = 'Groceries')
    or exists (select 1 from public.categories where name = 'Food at home') then
    raise exception 'Defaults must be independently editable per owner';
  end if;
end $$;

rollback;
