-- 초대받은 일정의 참석/거절/참석취소를 처리하는 RPC 함수입니다.
-- p_is_agree=true  : events_invite.is_agree를 true로 변경(참석하기)
-- p_is_agree=false : events_invite row 삭제(참석거절/참석취소)
create or replace function public.respond_event_invite(
    p_event_id bigint,
    p_is_agree boolean
)
returns void
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

    if p_is_agree then
        update public.events_invite
           set is_agree = true
         where event_id = p_event_id
           and profile_id = v_user_id;

        if not found then
            raise exception '수락할 초대 일정을 찾지 못했습니다.';
        end if;
    else
        delete from public.events_invite
         where event_id = p_event_id
           and profile_id = v_user_id;

        if not found then
            raise exception '취소할 초대 일정을 찾지 못했습니다.';
        end if;
    end if;
end;
$$;

grant execute on function public.respond_event_invite(bigint, boolean) to authenticated;
