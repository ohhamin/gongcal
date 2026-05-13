-- 일정 수정 화면의 참석자 목록 조회를 RLS에 막히지 않게 처리하는 RPC 함수입니다.
-- 이벤트 소유자 또는 해당 이벤트에 초대된 사용자만 참석자 목록을 조회할 수 있습니다.
create or replace function public.get_event_invite_attendees(
    p_event_id bigint
)
returns table (
    event_id bigint,
    profile_id uuid,
    nickname text,
    is_agree boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if not exists (
        select 1
        from public.events e
        where e.id = p_event_id
          and e.user_id = v_user_id
    ) and not exists (
        select 1
        from public.events_invite ei
        where ei.event_id = p_event_id
          and ei.profile_id = v_user_id
    ) then
        raise exception '참석자 목록을 조회할 권한이 없습니다.';
    end if;

    return query
    select
        ei.event_id,
        ei.profile_id,
        p.nickname,
        ei.is_agree
    from public.events_invite ei
    left join public.profiles p on p.id = ei.profile_id
    where ei.event_id = p_event_id
    order by coalesce(p.nickname, ''), ei.profile_id;
end;
$$;

grant execute on function public.get_event_invite_attendees(bigint) to authenticated;
