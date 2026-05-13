-- 월간 캘린더에서 내가 초대받은 일정을 RLS에 막히지 않게 조회하는 RPC 함수입니다.
-- events_invite.profile_id가 현재 사용자(auth.uid / profiles.id)인 초대 row와 연결된 events 데이터를 반환합니다.
create or replace function public.get_my_invited_events(
    p_range_start timestamptz,
    p_range_end timestamptz
)
returns table (
    id bigint,
    title text,
    detail text,
    start_at timestamptz,
    end_at timestamptz,
    user_id uuid,
    is_hidden boolean,
    is_allday boolean,
    invite_profile_id uuid,
    invite_is_agree boolean
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

    return query
    select
        e.id,
        e.title,
        e.detail,
        e.start_at,
        e.end_at,
        e.user_id,
        e.is_hidden,
        e.is_allday,
        ei.profile_id as invite_profile_id,
        ei.is_agree as invite_is_agree
    from public.events_invite ei
    join public.events e on e.id = ei.event_id
    where ei.profile_id = v_user_id
      and e.start_at < p_range_end
      and e.end_at >= p_range_start
    order by e.start_at, e.title;
end;
$$;

grant execute on function public.get_my_invited_events(timestamptz, timestamptz) to authenticated;
