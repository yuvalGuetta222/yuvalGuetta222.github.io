-- Applied to project vimklcufkafrmkcfxxak on 2026-10-26 as version 20261026194216.
-- Additive only: no historical financial records are modified.
create table if not exists public.tevuna_savings_goals (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.tevuna_households(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(btrim(title)) between 2 and 80),
 target_agorot bigint not null check (target_agorot > 0 and target_agorot <= 100000000000),
 saved_agorot bigint not null default 0 check (saved_agorot >= 0 and saved_agorot <= 100000000000),
 target_month date,
 created_at timestamptz not null default now(),
 check (target_month is null or extract(day from target_month) = 1)
);
create index if not exists tevuna_savings_goals_household_idx on public.tevuna_savings_goals(household_id, created_at desc);
alter table public.tevuna_savings_goals enable row level security;
revoke all on table public.tevuna_savings_goals from PUBLIC, anon;
grant select, insert, update, delete on table public.tevuna_savings_goals to authenticated;
create policy tevuna_goal_read on public.tevuna_savings_goals for select to authenticated
 using (exists (select 1 from public.tevuna_members m
   where m.household_id=tevuna_savings_goals.household_id and m.user_id=(select auth.uid())));
create policy tevuna_goal_add on public.tevuna_savings_goals for insert to authenticated
 with check (created_by=(select auth.uid()) and exists (select 1 from public.tevuna_members m
   where m.household_id=tevuna_savings_goals.household_id and m.user_id=(select auth.uid())));
create policy tevuna_goal_edit on public.tevuna_savings_goals for update to authenticated
 using (exists (select 1 from public.tevuna_members m
   where m.household_id=tevuna_savings_goals.household_id and m.user_id=(select auth.uid())))
 with check (exists (select 1 from public.tevuna_members m
   where m.household_id=tevuna_savings_goals.household_id and m.user_id=(select auth.uid())));
create policy tevuna_goal_delete on public.tevuna_savings_goals for delete to authenticated
 using (exists (select 1 from public.tevuna_members m
   where m.household_id=tevuna_savings_goals.household_id and m.user_id=(select auth.uid())));
