create or replace function public.consume_ai_rate_limit()
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_today date := current_date;
  v_allowed boolean;
begin
  if v_uid is null then
    return false;
  end if;

  insert into private.ai_rate_limits(user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select
    case
      when day_started_at < v_today then true
      when day_count >= 300 then false
      when window_started_at < v_now - interval '10 minutes' then true
      when window_count >= 30 then false
      else true
    end
  into v_allowed
  from private.ai_rate_limits
  where user_id = v_uid
  for update;

  if not v_allowed then
    return false;
  end if;

  update private.ai_rate_limits
     set window_started_at = case
           when window_started_at < v_now - interval '10 minutes' then v_now
           else window_started_at
         end,
         window_count = case
           when window_started_at < v_now - interval '10 minutes' then 1
           else window_count + 1
         end,
         day_started_at = case
           when day_started_at < v_today then v_today
           else day_started_at
         end,
         day_count = case
           when day_started_at < v_today then 1
           else day_count + 1
         end
   where user_id = v_uid;

  return true;
end;
$function$;

revoke all on table private.ai_rate_limits from anon, authenticated;
revoke all on function public.consume_ai_rate_limit() from public, anon;
grant execute on function public.consume_ai_rate_limit() to authenticated, service_role;
