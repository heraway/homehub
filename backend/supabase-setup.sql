-- HomeHub online setup. Paste this whole file into Supabase > SQL Editor > New query, then click Run.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id text not null
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- People can only read their own household. All writes go through the functions below.
drop policy if exists "read own household" on public.households;
create policy "read own household" on public.households for select to authenticated
  using (id in (select household_id from public.household_members where user_id = auth.uid()));

drop policy if exists "read own membership" on public.household_members;
create policy "read own membership" on public.household_members for select to authenticated
  using (user_id = auth.uid());

create or replace function public.hh_create(p_state jsonb, p_member_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'already in a household';
  end if;
  insert into households(state) values (p_state) returning id into hid;
  insert into household_members(user_id, household_id, member_id) values (auth.uid(), hid, p_member_id);
  return jsonb_build_object('id', hid, 'version', 1);
end $$;

create or replace function public.hh_join(p_code text, p_member_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'already in a household';
  end if;
  select h.id into hid from households h
   where exists (
     select 1 from jsonb_array_elements(h.state->'invites') e
      where upper(e->>'code') = upper(p_code)
        and ((e->>'used') is null or coalesce((e->>'multi')::boolean, false))
   ) limit 1;
  if hid is null then raise exception 'invalid code'; end if;
  insert into household_members(user_id, household_id, member_id) values (auth.uid(), hid, p_member_id);
  return jsonb_build_object('id', hid, 'member_id', p_member_id);
end $$;

create or replace function public.hh_push(p_id uuid, p_base bigint, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not exists (select 1 from household_members where user_id = auth.uid() and household_id = p_id) then
    raise exception 'forbidden';
  end if;
  update households set state = p_state, version = version + 1, updated_at = now()
   where id = p_id and version = p_base returning version into v;
  if v is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'version', v);
end $$;

revoke all on function public.hh_create(jsonb, text) from public, anon;
revoke all on function public.hh_join(text, text) from public, anon;
revoke all on function public.hh_push(uuid, bigint, jsonb) from public, anon;
grant execute on function public.hh_create(jsonb, text) to authenticated;
grant execute on function public.hh_join(text, text) to authenticated;
grant execute on function public.hh_push(uuid, bigint, jsonb) to authenticated;
