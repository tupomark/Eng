-- Local/test foundation only. Apply to a hosted development project after review.
-- Existing lexical/skill identifiers and all baseline facts are preserved.
begin;
alter type public.learning_skill add value if not exists 'listening';
alter type public.learning_skill add value if not exists 'pronunciation';
commit;

begin;

alter table public.user_saved_senses
  add column archived_at timestamptz,
  add column revision bigint not null default 0 check (revision >= 0);
alter table public.library_documents
  add column archived_at timestamptz,
  add column revision bigint not null default 0 check (revision >= 0);

-- A normal removal may never cascade through canonical learning history.
-- Direct account FKs retain the separately authorised account-purge semantics.
alter table public.learning_evidence
  drop constraint learning_evidence_user_id_sense_id_fkey,
  add constraint evidence_saved_intent_fk foreign key (user_id, sense_id)
    references public.user_saved_senses(user_id, sense_id)
    on delete no action deferrable initially deferred,
  add constraint evidence_account_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  add column recorded_at timestamptz not null default clock_timestamp(),
  add column task_id text,
  add column task_version text,
  add column independence text not null default 'unknown'
    check (independence in ('unknown','independent','hinted','assisted')),
  add column assistance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(assistance) = 'object'),
  add column trace_id text;
alter table public.skill_progress
  drop constraint skill_progress_user_id_sense_id_fkey,
  add constraint progress_saved_intent_fk foreign key (user_id, sense_id)
    references public.user_saved_senses(user_id, sense_id)
    on delete no action deferrable initially deferred,
  add constraint progress_account_fk foreign key (user_id)
    references auth.users(id) on delete cascade,
  alter column built_at set default clock_timestamp();
alter table public.evidence_disputes
  add column recorded_at timestamptz not null default clock_timestamp();

-- Added provenance columns must not become a way for an untrusted client to
-- claim a verified task, known independence or evaluator-supplied assistance.
drop policy evidence_self_review_insert on public.learning_evidence;
create policy evidence_self_review_insert on public.learning_evidence for insert to authenticated
  with check ((select auth.uid()) = user_id and source = 'self-review'
    and skill = 'recognition' and rating is not null
    and source_version = 'self-review-v1' and rubric_version = 'self-review-v1'
    and score is null and confidence is null
    and assessor_provider is null and assessor_model is null
    and task_id is null and task_version is null and trace_id is null
    and independence = 'unknown' and assistance = '{}'::jsonb
    and occurred_at >= '1970-01-01'::timestamptz
    and occurred_at <= clock_timestamp()+interval '5 minutes');

-- Even a backdated browser insert must make an older projection unreadable.
-- This invoker trigger changes NEW only; it does not bypass table privileges/RLS.
create schema if not exists lexis_private;
revoke all on schema lexis_private from public, anon, authenticated;
grant usage on schema lexis_private to service_role;
create function lexis_private.stamp_recorded_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.recorded_at := clock_timestamp(); return new; end;
$$;
revoke all on function lexis_private.stamp_recorded_at() from public, anon, authenticated;
create trigger evidence_recorded_at before insert on public.learning_evidence
  for each row execute function lexis_private.stamp_recorded_at();
create trigger dispute_recorded_at before insert on public.evidence_disputes
  for each row execute function lexis_private.stamp_recorded_at();
drop policy progress_owner_read on public.skill_progress;
create policy progress_owner_read on public.skill_progress for select to authenticated
using ((select auth.uid()) = user_id and
  not exists (select 1 from public.learning_evidence e
    where e.user_id = skill_progress.user_id and e.sense_id = skill_progress.sense_id
      and e.skill = skill_progress.skill and e.recorded_at > skill_progress.built_at) and
  not exists (select 1 from public.evidence_disputes d
    join public.learning_evidence e on e.user_id = d.user_id and e.id = d.evidence_id
    where e.user_id = skill_progress.user_id and e.sense_id = skill_progress.sense_id
      and e.skill = skill_progress.skill and d.recorded_at > skill_progress.built_at));
create index evidence_freshness_idx on public.learning_evidence(user_id,sense_id,skill,recorded_at);
create index disputes_freshness_idx on public.evidence_disputes(user_id,recorded_at,evidence_id);

create table lexis_private.command_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_key text not null check (char_length(command_key) between 1 and 200),
  command_type text not null,
  payload_fingerprint text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  completed_at timestamptz not null default clock_timestamp(),
  primary key (user_id,command_key)
);
alter table lexis_private.command_receipts enable row level security;
revoke all on lexis_private.command_receipts from public,anon,authenticated;
grant all on lexis_private.command_receipts to service_role;

create table lexis_private.legacy_id_map (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null check (char_length(namespace) between 1 and 100),
  legacy_id text not null check (char_length(legacy_id) between 1 and 500),
  mapped_id uuid not null,
  mapping_version text not null default 'lexis-uuid-v5-v1',
  primary key (user_id,namespace,legacy_id),
  unique (user_id,mapped_id)
);
alter table lexis_private.legacy_id_map enable row level security;
revoke all on lexis_private.legacy_id_map from public,anon,authenticated;
grant all on lexis_private.legacy_id_map to service_role;

create table public.user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  archived_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  unique(user_id,id)
);
create table public.collection_senses (
  user_id uuid not null,
  collection_id uuid not null,
  sense_id text not null,
  primary key(user_id,collection_id,sense_id),
  foreign key(user_id,collection_id) references public.user_collections(user_id,id) on delete cascade,
  foreign key(user_id,sense_id) references public.user_saved_senses(user_id,sense_id) on delete cascade
);
create index collection_senses_sense_idx on public.collection_senses(user_id,sense_id);
create table public.saved_sense_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sense_id text not null,
  document_id uuid,
  source_anchor jsonb not null default '{}'::jsonb check(jsonb_typeof(source_anchor)='object'),
  excerpt text not null check(char_length(excerpt) <= 2000),
  provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(user_id,sense_id) references public.user_saved_senses(user_id,sense_id) on delete cascade,
  foreign key(user_id,document_id) references public.library_documents(user_id,id) on delete set null(document_id)
);
create index saved_contexts_sense_idx on public.saved_sense_contexts(user_id,sense_id,created_at,id);
create index saved_contexts_document_idx on public.saved_sense_contexts(user_id,document_id) where document_id is not null;

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null,
  version_key text not null check(char_length(version_key) between 1 and 200),
  source_format text not null check(source_format in ('text','epub','sample')),
  rights_statement text not null check(char_length(rights_statement) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,id),
  unique(user_id,document_id,id),
  unique(user_id,document_id,version_key),
  foreign key(user_id,document_id) references public.library_documents(user_id,id) on delete cascade
);
create table public.document_chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version_id uuid not null,
  chapter_key text not null check(char_length(chapter_key) between 1 and 300),
  ordinal integer not null check(ordinal >= 0),
  title text not null check(char_length(title) <= 500),
  paragraphs jsonb not null check(jsonb_typeof(paragraphs)='array' and octet_length(paragraphs::text) <= 2000000),
  unique(user_id,id),
  unique(user_id,version_id,id),
  unique(user_id,version_id,chapter_key),
  unique(user_id,version_id,ordinal),
  foreign key(user_id,version_id) references public.document_versions(user_id,id) on delete cascade
);
alter table public.reader_positions
  add column version_id uuid,
  add column chapter_id uuid,
  add column paragraph_key text,
  add column revision bigint not null default 0 check(revision >= 0),
  add foreign key(user_id,document_id,version_id) references public.document_versions(user_id,document_id,id)
    on delete no action deferrable initially deferred,
  add foreign key(user_id,version_id,chapter_id) references public.document_chapters(user_id,version_id,id)
    on delete no action deferrable initially deferred,
  add check(chapter_id is null or version_id is not null);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_format text not null check(source_format in ('txt','csv','xlsx','paste','reverso-paste')),
  status text not null default 'preview' check(status in ('preview','inbox','accepted','cancelled','rolled-back')),
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,id)
);
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  batch_id uuid not null,
  ordinal integer not null check(ordinal >= 0),
  surface text not null check(char_length(surface) between 1 and 1000),
  translation text not null default '' check(char_length(translation) <= 2000),
  context text not null default '' check(char_length(context) <= 2000),
  candidate_sense_id text references public.senses(id) on delete restrict,
  status text not null default 'unresolved' check(status in ('unresolved','proposed','accepted','deferred','rejected','duplicate')),
  created_saved_intent boolean not null default false,
  unique(user_id,batch_id,ordinal),
  foreign key(user_id,batch_id) references public.import_batches(user_id,id) on delete cascade
);
create index import_rows_status_idx on public.import_rows(user_id,batch_id,status,ordinal);

create table public.writing_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 300),
  current_revision_id uuid,
  revision bigint not null default 0 check(revision >= 0),
  archived_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,id)
);
create table public.writing_revisions (
  id uuid primary key,
  user_id uuid not null,
  draft_id uuid not null,
  parent_revision_id uuid,
  body text not null check(char_length(body) <= 100000),
  origin text not null default 'user' check(origin in ('user','restored','accepted-suggestion')),
  is_conflict boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,id),
  unique(user_id,draft_id,id),
  foreign key(user_id,draft_id) references public.writing_drafts(user_id,id) on delete cascade,
  foreign key(user_id,draft_id,parent_revision_id) references public.writing_revisions(user_id,draft_id,id)
    on delete no action deferrable initially deferred
);
alter table public.writing_drafts add constraint writing_current_revision_fk
  foreign key(user_id,id,current_revision_id) references public.writing_revisions(user_id,draft_id,id)
  on delete no action deferrable initially deferred;
create index writing_revisions_history_idx on public.writing_revisions(user_id,draft_id,created_at,id);

-- All new public entities are private to their owner. Mutations use trusted
-- server commands; a client cannot forge receipts, revision heads or verdicts.
do $$
declare table_name text;
begin
  foreach table_name in array array['user_collections','collection_senses','saved_sense_contexts',
    'document_versions','document_chapters','import_batches','import_rows','writing_drafts','writing_revisions']
  loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',table_name);
  end loop;
end;
$$;

-- This private invoker helper runs only in the already authenticated server
-- transaction. The advisory lock serialises retries of the same user/key.
create function lexis_private.previous_command(p_user uuid,p_key text,p_type text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt lexis_private.command_receipts;
begin
  if p_user is null or p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'Invalid command identity' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_key,0));
  select * into receipt from lexis_private.command_receipts where user_id=p_user and command_key=p_key;
  if found then
    if receipt.command_type<>p_type or receipt.payload_fingerprint<>p_fingerprint then
      raise exception 'Idempotency key already used for a different command' using errcode='22023';
    end if;
    return receipt.result;
  end if;
  return null;
end;
$$;
revoke all on function lexis_private.previous_command(uuid,text,text,text) from public,anon,authenticated;
grant execute on function lexis_private.previous_command(uuid,text,text,text) to service_role;

create function public.map_legacy_id_command(p_user_id uuid,p_namespace text,p_legacy_id text,p_mapped_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare mapped uuid;
begin
  if p_user_id is null or p_mapped_id is null or p_namespace is null or p_legacy_id is null
    or char_length(p_namespace) not between 1 and 100 or char_length(p_legacy_id) not between 1 and 500 then
    raise exception 'Invalid legacy mapping' using errcode='22023';
  end if;
  insert into lexis_private.legacy_id_map(user_id,namespace,legacy_id,mapped_id)
    values(p_user_id,p_namespace,p_legacy_id,p_mapped_id)
    on conflict(user_id,namespace,legacy_id) do nothing;
  select mapped_id into mapped from lexis_private.legacy_id_map
    where user_id=p_user_id and namespace=p_namespace and legacy_id=p_legacy_id;
  if mapped is distinct from p_mapped_id then
    raise exception 'Legacy identity already has a different mapping' using errcode='22023';
  end if;
  return mapped;
end;
$$;
revoke all on function public.map_legacy_id_command(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.map_legacy_id_command(uuid,text,text,uuid) to service_role;

create function public.archive_saved_sense_command(p_user_id uuid,p_sense_id text,p_key text,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; fingerprint text; item public.user_saved_senses;
begin
  if p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Expected revision required' using errcode='22023';
  end if;
  fingerprint:=md5(jsonb_build_array(p_sense_id,p_expected_revision)::text);
  result:=lexis_private.previous_command(p_user_id,p_key,'archive-sense',fingerprint);
  if result is not null then return result; end if;
  select * into item from public.user_saved_senses where user_id=p_user_id and sense_id=p_sense_id for update;
  if not found then raise exception 'Saved meaning not found' using errcode='P0002'; end if;
  if item.revision<>p_expected_revision then raise exception 'Saved meaning changed; reload before retrying' using errcode='40001'; end if;
  update public.user_saved_senses set archived_at=coalesce(archived_at,clock_timestamp()),revision=revision+1
    where user_id=p_user_id and sense_id=p_sense_id;
  result:=jsonb_build_object('senseId',p_sense_id,'archived',true,'revision',item.revision+1);
  insert into lexis_private.command_receipts values(p_user_id,p_key,'archive-sense',fingerprint,result,clock_timestamp());
  return result;
end;
$$;

create function public.record_self_review_command(p_user_id uuid,p_sense_id text,p_event_id uuid,
  p_key text,p_rating public.review_rating,p_occurred_at timestamptz,p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; fingerprint text; item public.user_saved_senses;
begin
  if p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Expected revision required' using errcode='22023';
  end if;
  if p_event_id is null or p_rating is null or p_occurred_at is null
    or p_occurred_at < '1970-01-01'::timestamptz or p_occurred_at > clock_timestamp()+interval '5 minutes' then
    raise exception 'Invalid review time or rating' using errcode='22023';
  end if;
  fingerprint:=md5(jsonb_build_array(p_sense_id,p_event_id,p_rating,p_occurred_at,p_expected_revision)::text);
  result:=lexis_private.previous_command(p_user_id,p_key,'self-review',fingerprint);
  if result is not null then return result; end if;
  select * into item from public.user_saved_senses where user_id=p_user_id and sense_id=p_sense_id for update;
  if not found then raise exception 'Saved meaning not found' using errcode='P0002'; end if;
  if item.archived_at is not null then raise exception 'Restore this meaning before reviewing' using errcode='22023'; end if;
  if item.revision<>p_expected_revision then raise exception 'Saved meaning changed; reload before retrying' using errcode='40001'; end if;
  insert into public.learning_evidence(id,user_id,sense_id,skill,source,source_version,rubric_version,rating,
    occurred_at,idempotency_key,independence)
    values(p_event_id,p_user_id,p_sense_id,'recognition','self-review','self-review-v1','self-review-v1',
      p_rating,p_occurred_at,p_event_id,'unknown');
  delete from public.skill_progress where user_id=p_user_id and sense_id=p_sense_id and skill='recognition';
  update public.user_saved_senses set revision=revision+1 where user_id=p_user_id and sense_id=p_sense_id;
  result:=jsonb_build_object('evidenceId',p_event_id,'revision',item.revision+1,'projectionInvalidated',true);
  insert into lexis_private.command_receipts values(p_user_id,p_key,'self-review',fingerprint,result,clock_timestamp());
  return result;
end;
$$;

create function public.dispute_evidence_command(p_user_id uuid,p_evidence_id uuid,p_key text,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; fingerprint text; evidence public.learning_evidence;
begin
  if p_reason is null or char_length(p_reason)>1000 then raise exception 'Invalid dispute reason' using errcode='22023'; end if;
  fingerprint:=md5(jsonb_build_array(p_evidence_id,p_reason)::text);
  result:=lexis_private.previous_command(p_user_id,p_key,'dispute-evidence',fingerprint);
  if result is not null then return result; end if;
  select * into evidence from public.learning_evidence where user_id=p_user_id and id=p_evidence_id;
  if not found then raise exception 'Observation not found' using errcode='P0002'; end if;
  perform 1 from public.user_saved_senses where user_id=p_user_id and sense_id=evidence.sense_id for update;
  insert into public.evidence_disputes(user_id,evidence_id,reason) values(p_user_id,p_evidence_id,p_reason)
    on conflict(user_id,evidence_id) do nothing;
  delete from public.skill_progress where user_id=p_user_id and sense_id=evidence.sense_id and skill=evidence.skill;
  update public.user_saved_senses set revision=revision+1 where user_id=p_user_id and sense_id=evidence.sense_id;
  result:=jsonb_build_object('evidenceId',p_evidence_id,'excluded',true,'projectionInvalidated',true);
  insert into lexis_private.command_receipts values(p_user_id,p_key,'dispute-evidence',fingerprint,result,clock_timestamp());
  return result;
end;
$$;

create function public.purge_saved_sense_command(p_user_id uuid,p_sense_id text,p_key text,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; fingerprint text; removed_count bigint;
begin
  if p_confirmation is distinct from 'DELETE HISTORY: ' || p_sense_id then
    raise exception 'Explicit history deletion confirmation required' using errcode='22023';
  end if;
  fingerprint:=md5(jsonb_build_array(p_sense_id,p_confirmation)::text);
  result:=lexis_private.previous_command(p_user_id,p_key,'purge-sense',fingerprint);
  if result is not null then return result; end if;
  perform 1 from public.user_saved_senses where user_id=p_user_id and sense_id=p_sense_id for update;
  if not found then raise exception 'Saved meaning not found' using errcode='P0002'; end if;
  delete from public.learning_evidence where user_id=p_user_id and sense_id=p_sense_id;
  get diagnostics removed_count=row_count;
  delete from public.skill_progress where user_id=p_user_id and sense_id=p_sense_id;
  delete from public.user_saved_senses where user_id=p_user_id and sense_id=p_sense_id;
  result:=jsonb_build_object('senseId',p_sense_id,'purged',true,'removedEvidenceCount',removed_count);
  insert into lexis_private.command_receipts values(p_user_id,p_key,'purge-sense',fingerprint,result,clock_timestamp());
  return result;
end;
$$;

create function public.append_writing_revision_command(p_user_id uuid,p_draft_id uuid,p_revision_id uuid,
  p_parent_revision_id uuid,p_body text,p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; fingerprint text; draft public.writing_drafts; conflict boolean;
begin
  if p_revision_id is null or p_body is null or char_length(p_body)>100000 then
    raise exception 'Invalid writing revision' using errcode='22023';
  end if;
  fingerprint:=md5(jsonb_build_array(p_draft_id,p_revision_id,p_parent_revision_id,p_body)::text);
  result:=lexis_private.previous_command(p_user_id,p_key,'append-writing-revision',fingerprint);
  if result is not null then return result; end if;
  select * into draft from public.writing_drafts where user_id=p_user_id and id=p_draft_id for update;
  if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
  conflict:=draft.current_revision_id is distinct from p_parent_revision_id;
  insert into public.writing_revisions(id,user_id,draft_id,parent_revision_id,body,is_conflict)
    values(p_revision_id,p_user_id,p_draft_id,p_parent_revision_id,p_body,conflict);
  if not conflict then
    update public.writing_drafts set current_revision_id=p_revision_id,revision=revision+1,updated_at=clock_timestamp()
      where user_id=p_user_id and id=p_draft_id;
  end if;
  result:=jsonb_build_object('revisionId',p_revision_id,'conflict',conflict,
    'currentRevisionId',case when conflict then draft.current_revision_id else p_revision_id end);
  insert into lexis_private.command_receipts values(p_user_id,p_key,'append-writing-revision',fingerprint,result,clock_timestamp());
  return result;
end;
$$;

-- Public schema does not imply public execution. Functions are invoker-only,
-- and exclusively the trusted server role may execute mutations.
revoke all on function public.archive_saved_sense_command(uuid,text,text,bigint),
  public.record_self_review_command(uuid,text,uuid,text,public.review_rating,timestamptz,bigint),
  public.dispute_evidence_command(uuid,uuid,text,text),
  public.purge_saved_sense_command(uuid,text,text,text),
  public.append_writing_revision_command(uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.archive_saved_sense_command(uuid,text,text,bigint),
  public.record_self_review_command(uuid,text,uuid,text,public.review_rating,timestamptz,bigint),
  public.dispute_evidence_command(uuid,uuid,text,text),
  public.purge_saved_sense_command(uuid,text,text,text),
  public.append_writing_revision_command(uuid,uuid,uuid,uuid,text,text) to service_role;

comment on column public.learning_evidence.independence is 'Legacy self-review assistance is unknown, never silently upgraded to independent production.';
comment on table lexis_private.command_receipts is 'Server command retry results. Contains fingerprints rather than writing bodies. Never exposed through the Data API.';
comment on table public.writing_revisions is 'Append-only server writes. A stale parent persists a conflict branch without replacing the current head.';
comment on table public.import_rows is 'Unresolved rows are learning material, not evidence, not automatically due.';

commit;
