-- events + events_invite 저장을 단일 PostgreSQL 트랜잭션으로 처리하는 RPC 함수입니다.
-- Supabase SQL Editor에서 실행하거나 마이그레이션에 포함하세요.
create or replace function public.save_event_with_invites(
    p_event_id bigint,
    p_title text,
    p_detail text,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_is_hidden boolean,
    p_is_allday boolean,
    p_invites jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
as $$
declare
    v_event_id bigint;
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null then
        raise exception '로그인이 필요합니다.';
    end if;

    if p_event_id is null then
        insert into public.events (title, detail, start_at, end_at, is_hidden, is_allday, user_id)
        values (p_title, p_detail, p_start_at, p_end_at, p_is_hidden, p_is_allday, v_user_id)
        returning id into v_event_id;
    else
        update public.events
           set title = p_title,
               detail = p_detail,
               start_at = p_start_at,
               end_at = p_end_at,
               is_hidden = p_is_hidden,
               is_allday = p_is_allday
         where id = p_event_id
           and user_id = v_user_id
        returning id into v_event_id;

        if v_event_id is null then
            raise exception '수정 가능한 일정을 찾지 못했습니다.';
        end if;

        delete from public.events_invite where event_id = v_event_id;
    end if;

    insert into public.events_invite (event_id, profile_id, is_agree)
    select
        v_event_id,
        (invite_item->>'profile_id')::uuid,
        coalesce((invite_item->>'is_agree')::boolean, false)
    from jsonb_array_elements(p_invites) as invite_item;

    return v_event_id;
end;
$$;
