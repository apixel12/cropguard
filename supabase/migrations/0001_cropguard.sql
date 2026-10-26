-- CropGuard: optional accounts that sync scan RESULTS (never photos).
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Security model (OWASP ASVS V4 access control): every row belongs to one user and
-- row-level security (RLS) makes the database itself refuse other users' rows,
-- whatever the app or an attacker sends. Anonymous (signed-out) clients get nothing.

create table if not exists public.scans (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  crop          text not null check (char_length(crop) between 1 and 64),
  prediction    text not null check (char_length(prediction) between 1 and 128),
  status        text not null check (status in ('confident', 'uncertain')),
  confidence    real not null check (confidence >= 0 and confidence <= 1),
  model_version text not null check (char_length(model_version) between 1 and 32),
  scanned_at    timestamptz not null check (scanned_at < now() + interval '1 day'),
  created_at    timestamptz not null default now()
);
create index if not exists scans_user_scanned on public.scans (user_id, scanned_at desc);

alter table public.scans enable row level security;
alter table public.scans force row level security;

-- Signed-out (anon) clients: no access at all.
revoke all on public.scans from anon;
grant select, insert, update, delete on public.scans to authenticated;

-- Each user only sees and changes their own rows.
drop policy if exists "own rows: read"   on public.scans;
drop policy if exists "own rows: add"    on public.scans;
drop policy if exists "own rows: change" on public.scans;
drop policy if exists "own rows: delete" on public.scans;
create policy "own rows: read"   on public.scans for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: add"    on public.scans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: change" on public.scans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.scans for delete to authenticated using ((select auth.uid()) = user_id);

-- Users who turned on two-factor authentication must have completed it (AAL2)
-- before the database lets them touch their rows (Supabase MFA guidance).
drop policy if exists "two-factor when enrolled" on public.scans;
create policy "two-factor when enrolled" on public.scans as restrictive to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors where (select auth.uid()) = user_id and status = 'verified'
    )
  )
  with check (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors where (select auth.uid()) = user_id and status = 'verified'
    )
  );

-- Abuse limit: at most 10,000 synced results per account.
create or replace function public.scans_row_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.scans where user_id = new.user_id) >= 10000 then
    raise exception 'history limit reached';
  end if;
  return new;
end $$;
drop trigger if exists scans_row_cap on public.scans;
create trigger scans_row_cap before insert on public.scans for each row execute function public.scans_row_cap();
revoke execute on function public.scans_row_cap() from public, anon, authenticated;

-- "Delete my account": removes the caller's own user; their scans go with it (on delete cascade).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
