-- 일정 30분 전 FCM 푸시 설정/중복 발송 방지
-- Supabase SQL Editor에서 실행하세요.

-- 설정 페이지 토글 값입니다.
-- 기본값 true: 기존 사용자도 기능 배포 후 알림을 받습니다. 기본 OFF가 필요하면 default false로 바꾸세요.
alter table public.profiles
    add column if not exists schedule_30m_push_enabled boolean not null default true;

comment on column public.profiles.schedule_30m_push_enabled
    is '내 일정/수락한 초대 일정 시작 30분 전 FCM 푸시 수신 여부';

-- 가입 직후 접근 권한 안내 페이지를 한 번만 거쳤는지 저장합니다.
alter table public.profiles
    add column if not exists permissions_onboarding_completed boolean not null default false;

-- 이미 닉네임을 설정한 기존 사용자는 배포 후 갑자기 가입 온보딩으로 보내지 않도록 완료 처리합니다.
update public.profiles
set permissions_onboarding_completed = true
where nickname is not null
  and permissions_onboarding_completed = false;

comment on column public.profiles.permissions_onboarding_completed
    is '가입 직후 앱 접근 권한 안내 페이지 완료 여부';

-- 서버 CRON 재시도/동시 실행/시간 윈도우 중복 조회 시 같은 사용자에게 같은 일정 알림이 중복 발송되지 않게 합니다.
create table if not exists public.schedule_push_logs (
    id uuid primary key default gen_random_uuid(),
    schedule_id bigint not null,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    type text not null default 'schedule_before_30m',
    sent_at timestamptz not null default now(),
    constraint schedule_push_logs_type_check check (type in ('schedule_before_30m')),
    constraint schedule_push_logs_unique unique (schedule_id, profile_id, type)
);

create index if not exists schedule_push_logs_profile_sent_idx
    on public.schedule_push_logs(profile_id, sent_at desc);

create index if not exists schedule_push_logs_schedule_idx
    on public.schedule_push_logs(schedule_id);

alter table public.schedule_push_logs enable row level security;

-- 클라이언트에서 직접 읽거나 쓰지 않습니다. 서버 API가 service role key로만 insert합니다.
drop policy if exists "schedule_push_logs_no_client_select" on public.schedule_push_logs;
drop policy if exists "schedule_push_logs_no_client_insert" on public.schedule_push_logs;
drop policy if exists "schedule_push_logs_no_client_update" on public.schedule_push_logs;
drop policy if exists "schedule_push_logs_no_client_delete" on public.schedule_push_logs;
