-- Private cost/idempotency journal. No prompts or imported documents are stored here.
-- A bounded validated reply can be cached for delivery retry; expiry cleanup must
-- be scheduled by the operator before a live pilot (cleanup RPC below).
create table lexis_private.ai_request_reservations (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 100),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  feature text not null check (feature in ('tutor','verification')),
  reserved_microusd bigint not null check (reserved_microusd between 1 and 10000000000),
  status text not null default 'reserved' check (status in ('reserved','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb check (result is null or octet_length(result::text) <= 100000),
  result_expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (user_id,request_key)
);
alter table lexis_private.ai_request_reservations enable row level security;
revoke all on lexis_private.ai_request_reservations from public,anon,authenticated;
grant select,insert,update,delete on lexis_private.ai_request_reservations to service_role;
create index ai_reservations_owner_created_idx on lexis_private.ai_request_reservations(user_id,created_at);
create index ai_reservations_created_idx on lexis_private.ai_request_reservations(created_at);
create index ai_reservations_response_expiry_idx on lexis_private.ai_request_reservations(result_expires_at) where result is not null;

create function public.reserve_ai_request_command(
  p_user_id uuid,p_request_key text,p_fingerprint text,p_feature text,
  p_reserved_microusd bigint,p_user_budget_microusd bigint,
  p_server_budget_microusd bigint,p_daily_request_limit integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous lexis_private.ai_request_reservations%rowtype;
  day_start timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  user_cost bigint; server_cost bigint; user_count bigint;
begin
  if p_user_id is null or p_request_key is null or length(p_request_key) not between 1 and 100 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_feature is null or p_feature not in ('tutor','verification') or p_reserved_microusd is null or p_reserved_microusd not between 1 and 10000000000
    or p_user_budget_microusd is null or p_user_budget_microusd not between 1 and 10000000000 or p_server_budget_microusd is null or p_server_budget_microusd not between 1 and 10000000000
    or p_daily_request_limit is null or p_daily_request_limit not between 1 and 500 then raise exception 'Invalid AI reservation' using errcode='22023'; end if;
  -- Same global lock serializes the cap check and insertion across users too.
  perform pg_advisory_xact_lock(hashtextextended('lexis-ai-global-budget-v1',0));
  select * into previous from lexis_private.ai_request_reservations where user_id=p_user_id and request_key=p_request_key for update;
  if found then
    if previous.fingerprint <> p_fingerprint then return jsonb_build_object('status','conflict'); end if;
    if previous.status='reserved' then return jsonb_build_object('status','in-progress'); end if;
    if previous.result is not null and previous.result_expires_at>now() then return jsonb_build_object('status','replay','result',previous.result); end if;
    -- Tombstones remain after cache expiry: a delivery retry never buys a second call.
    return jsonb_build_object('status','conflict');
  end if;
  select count(*),coalesce(sum(reserved_microusd),0) into user_count,user_cost from lexis_private.ai_request_reservations where user_id=p_user_id and created_at>=day_start;
  select coalesce(sum(reserved_microusd),0) into server_cost from lexis_private.ai_request_reservations where created_at>=day_start;
  if user_count>=p_daily_request_limit or user_cost+p_reserved_microusd>p_user_budget_microusd or server_cost+p_reserved_microusd>p_server_budget_microusd then return jsonb_build_object('status','quota-exhausted'); end if;
  insert into lexis_private.ai_request_reservations(user_id,request_key,fingerprint,feature,reserved_microusd) values(p_user_id,p_request_key,p_fingerprint,p_feature,p_reserved_microusd);
  return jsonb_build_object('status','reserved');
end $$;

create function public.complete_ai_request_command(p_user_id uuid,p_request_key text,p_result jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_result is null or jsonb_typeof(p_result)<>'object' or p_result->'ok' is null or jsonb_typeof(p_result->'ok')<>'boolean' or octet_length(p_result::text)>100000 then raise exception 'Invalid AI result' using errcode='22023'; end if;
  update lexis_private.ai_request_reservations set status='completed',completed_at=now(),result=p_result
  where user_id=p_user_id and request_key=p_request_key and status='reserved';
  if not found then raise exception 'AI reservation missing or already completed' using errcode='P0002'; end if;
end $$;

create function public.clear_ai_reply_cache_command(p_user_id uuid)
returns void language sql security invoker set search_path='' as $$
  -- Seal in-flight reservations too: a late provider completion cannot recreate
  -- private reply bytes after a successful deletion. Keep the cost/idempotency tombstone.
  update lexis_private.ai_request_reservations
  set result=null,status='completed',completed_at=coalesce(completed_at,now()),
      result_expires_at=least(result_expires_at,now())
  where user_id=p_user_id;
$$;
create function lexis_private.expire_ai_reply_cache()
returns void language sql security invoker set search_path='' as $$
  update lexis_private.ai_request_reservations set result=null where result is not null and result_expires_at<=now();
$$;
revoke all on function public.reserve_ai_request_command(uuid,text,text,text,bigint,bigint,bigint,integer) from public,anon,authenticated;
revoke all on function public.complete_ai_request_command(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.clear_ai_reply_cache_command(uuid) from public,anon,authenticated;
revoke all on function lexis_private.expire_ai_reply_cache() from public,anon,authenticated;
grant execute on function public.reserve_ai_request_command(uuid,text,text,text,bigint,bigint,bigint,integer) to service_role;
grant execute on function public.complete_ai_request_command(uuid,text,jsonb) to service_role;
grant execute on function public.clear_ai_reply_cache_command(uuid) to service_role;
grant execute on function lexis_private.expire_ai_reply_cache() to service_role;
