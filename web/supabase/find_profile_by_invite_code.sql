-- profiles.id(uuid)의 앞 8자리를 초대코드로 보고 정확히 일치하는 프로필 1명을 찾습니다.
-- like 검색이 아니라 left(id::text, 8) = p_invite_code 조건을 사용합니다.

create or replace function public.find_profile_by_invite_code(p_invite_code text)
returns table (
    id uuid,
    nickname text
)
language sql
stable
security definer
set search_path = public
as $$
    select p.id, p.nickname
      from public.profiles p
     where left(p.id::text, 8) = lower(trim(p_invite_code))
     limit 1;
$$;

revoke all on function public.find_profile_by_invite_code(text) from public;
grant execute on function public.find_profile_by_invite_code(text) to authenticated;
