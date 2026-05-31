-- OURCAL FCM push token storage
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.push_tokens (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    token text not null,
    platform text not null check (platform in ('android', 'ios', 'web', 'unknown')),
    app_version text,
    device_label text,
    last_seen_at timestamptz not null default now(),
    disabled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint push_tokens_token_key unique (token)
);

create index if not exists push_tokens_profile_id_idx on public.push_tokens(profile_id);
create index if not exists push_tokens_active_profile_idx
    on public.push_tokens(profile_id, platform)
    where disabled_at is null;

alter table public.push_tokens enable row level security;

-- 로그인한 사용자는 본인 profile_id에 연결된 토큰만 조회/등록/갱신/삭제할 수 있습니다.
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
    on public.push_tokens for select
    using (auth.uid() = profile_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
    on public.push_tokens for insert
    with check (auth.uid() = profile_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
    on public.push_tokens for update
    using (auth.uid() = profile_id)
    with check (auth.uid() = profile_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
    on public.push_tokens for delete
    using (auth.uid() = profile_id);

create or replace function public.set_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_push_tokens_updated_at on public.push_tokens;
create trigger set_push_tokens_updated_at
    before update on public.push_tokens
    for each row
    execute function public.set_push_tokens_updated_at();
