-- 알림 목록과 읽음 상태를 저장하는 테이블입니다.
-- Supabase SQL Editor에서 실행하거나 마이그레이션에 포함하세요.
create table if not exists public.notifications (
    id bigint generated always as identity primary key,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    title text not null,
    message text,
    is_read boolean default false,
    related_id bigint,
    created_at timestamptz default now(),
    constraint notifications_type_check check (type in ('event_invite', 'friend_request'))
);

create index if not exists notifications_profile_created_idx
    on public.notifications (profile_id, created_at desc);

create index if not exists notifications_profile_unread_idx
    on public.notifications (profile_id, is_read)
    where is_read = false;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
    on public.notifications
    for select
    to authenticated
    using (profile_id = auth.uid());

create policy "notifications_update_own_read_state"
    on public.notifications
    for update
    to authenticated
    using (profile_id = auth.uid())
    with check (profile_id = auth.uid());

-- 이벤트 초대/친구 요청 생성 흐름에서 상대방 프로필의 알림을 만들 수 있게 허용합니다.
-- 실제 초대/친구 요청 권한은 각 원본 테이블의 RLS와 클라이언트 검증 흐름에서 제한합니다.
create policy "notifications_insert_authenticated"
    on public.notifications
    for insert
    to authenticated
    with check (true);
