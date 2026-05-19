-- 일정 삭제를 comments/events_invite/events 순서로 한 트랜잭션에서 처리하는 RPC 함수입니다.
-- 클라이언트에서 여러 테이블을 직접 삭제할 때 RLS/FK 순서 문제로 일부만 실패하는 상황을 줄입니다.

create or replace function public.delete_event_cascade(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_id uuid;
begin
    select e.user_id
      into v_owner_id
      from public.events e
     where e.id = p_event_id;

    if v_owner_id is null then
        raise exception 'event_not_found';
    end if;

    if v_owner_id <> auth.uid() then
        raise exception 'not_event_owner';
    end if;

    delete from public.comments where events_id = p_event_id;
    delete from public.events_invite where event_id = p_event_id;
    delete from public.events where id = p_event_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_event_cascade(bigint) from public;
grant execute on function public.delete_event_cascade(bigint) to authenticated;
