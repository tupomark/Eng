-- LEXIS knowledge foundation. No hosted database is changed by checking in this file.
-- Designed for PostgreSQL 15+ with Supabase Auth; tests supply minimal auth stubs.
begin;

create type public.learning_skill as enum ('recognition', 'context', 'recall', 'writing', 'speaking');
create type public.review_rating as enum ('again', 'hard', 'good', 'easy');

create table public.lexemes (
  id text primary key check (char_length(id) between 1 and 200),
  lemma text not null check (char_length(lemma) between 1 and 200),
  language_code text not null default 'en' check (language_code = 'en'),
  part_of_speech text not null check (char_length(part_of_speech) between 1 and 50),
  ipa text,
  source text not null check (char_length(source) between 1 and 200),
  source_version text not null check (char_length(source_version) between 1 and 100),
  unique (language_code, lemma, part_of_speech, source, source_version)
);

create table public.senses (
  id text primary key check (char_length(id) between 1 and 200),
  lexeme_id text not null references public.lexemes(id) on delete restrict,
  definition text not null check (char_length(definition) between 1 and 2000),
  translation_ru text not null check (char_length(translation_ru) between 1 and 1000),
  example text not null check (char_length(example) between 1 and 2000),
  collocations text[] not null default '{}',
  source_sense_key text not null,
  unique (lexeme_id, source_sense_key)
);
create index senses_lexeme_idx on public.senses(lexeme_id);

-- Metadata and position only. Do not upload a private book's body by default.
create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  source_kind text not null check (source_kind in ('original', 'import')),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.reader_positions (
  user_id uuid not null,
  document_id uuid not null,
  character_offset integer not null default 0 check (character_offset >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id),
  foreign key (user_id, document_id) references public.library_documents(user_id, id) on delete cascade
);

-- Saving adds a relationship, never a score or skill projection.
create table public.user_saved_senses (
  user_id uuid not null references auth.users(id) on delete cascade,
  sense_id text not null references public.senses(id) on delete restrict,
  context text not null default '' check (char_length(context) <= 1000),
  source_document_id uuid,
  saved_at timestamptz not null default now(),
  primary key (user_id, sense_id),
  foreign key (user_id, source_document_id) references public.library_documents(user_id, id)
    on delete set null (source_document_id)
);
create index saved_senses_sense_idx on public.user_saved_senses(sense_id);
create index saved_senses_document_idx on public.user_saved_senses(user_id, source_document_id)
  where source_document_id is not null;

-- Immutable observations. Their weight and score are decisions of a versioned projector.
create table public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sense_id text not null,
  skill public.learning_skill not null,
  source text not null check (source in ('self-review', 'ai-verification', 'reader', 'writing', 'voice', 'tutor')),
  source_version text not null check (char_length(source_version) between 1 and 100),
  rubric_version text not null check (char_length(rubric_version) between 1 and 100),
  rating public.review_rating,
  score double precision check (score >= 0 and score <= 1),
  confidence double precision check (confidence >= 0 and confidence <= 1),
  rationale text not null default '' check (char_length(rationale) <= 2000),
  assessor_provider text,
  assessor_model text,
  occurred_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (user_id, id),
  unique (user_id, idempotency_key),
  foreign key (user_id, sense_id) references public.user_saved_senses(user_id, sense_id) on delete cascade,
  check (source <> 'self-review' or (rating is not null and skill = 'recognition')),
  check (source <> 'ai-verification' or (assessor_provider is not null and assessor_model is not null))
);
create index evidence_replay_idx on public.learning_evidence(user_id, sense_id, skill, occurred_at, id);

-- A dispute excludes an observation; it does not rewrite the original assessment.
create table public.evidence_disputes (
  user_id uuid not null,
  evidence_id uuid not null,
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, evidence_id),
  foreign key (user_id, evidence_id) references public.learning_evidence(user_id, id) on delete cascade
);

-- Optional cache: authoritative facts remain saved senses + evidence + disputes.
-- No projection is created merely by saving. No browser role may write this table.
create table public.skill_progress (
  user_id uuid not null,
  sense_id text not null,
  skill public.learning_skill not null,
  score double precision not null check (score >= 0 and score <= 1),
  attempts integer not null check (attempts > 0),
  due_at timestamptz not null,
  interval_days double precision not null check (interval_days > 0),
  algorithm_version text not null check (char_length(algorithm_version) between 1 and 100),
  evidence_count integer not null check (evidence_count > 0),
  built_at timestamptz not null default now(),
  primary key (user_id, sense_id, skill),
  foreign key (user_id, sense_id) references public.user_saved_senses(user_id, sense_id) on delete cascade
);
create index progress_due_idx on public.skill_progress(user_id, due_at);

alter table public.lexemes enable row level security;
alter table public.senses enable row level security;
alter table public.library_documents enable row level security;
alter table public.reader_positions enable row level security;
alter table public.user_saved_senses enable row level security;
alter table public.learning_evidence enable row level security;
alter table public.evidence_disputes enable row level security;
alter table public.skill_progress enable row level security;

-- Explicitly reset privileges: Supabase project defaults may grant broad access.
revoke all on public.lexemes, public.senses, public.library_documents,
  public.reader_positions, public.user_saved_senses, public.learning_evidence,
  public.evidence_disputes, public.skill_progress from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.lexemes, public.senses to authenticated;
grant select, insert, update, delete on public.library_documents, public.reader_positions,
  public.user_saved_senses to authenticated;
grant select, insert on public.learning_evidence, public.evidence_disputes to authenticated;
grant select on public.skill_progress to authenticated;
grant all on public.lexemes, public.senses, public.library_documents,
  public.reader_positions, public.user_saved_senses, public.learning_evidence,
  public.evidence_disputes, public.skill_progress to service_role;

create policy lexemes_read on public.lexemes for select to authenticated using (true);
create policy senses_read on public.senses for select to authenticated using (true);

create policy documents_owner on public.library_documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy positions_owner on public.reader_positions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_senses_owner on public.user_saved_senses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy evidence_owner_read on public.learning_evidence for select to authenticated
  using ((select auth.uid()) = user_id);
create policy evidence_self_review_insert on public.learning_evidence for insert to authenticated
  with check ((select auth.uid()) = user_id and source = 'self-review'
    and skill = 'recognition' and rating is not null
    and source_version = 'self-review-v1' and rubric_version = 'self-review-v1'
    and score is null and confidence is null
    and assessor_provider is null and assessor_model is null);

create policy disputes_owner_read on public.evidence_disputes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy disputes_owner_insert on public.evidence_disputes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy progress_owner_read on public.skill_progress for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.skill_progress is 'Rebuildable per-sense per-skill projection. Server projector is a production integration gate.';
comment on table public.learning_evidence is 'Append-only for browser roles. Self-review evidence is self-reported recognition, not verified mastery.';
comment on table public.evidence_disputes is 'Owned immutable exclusion events. Projector must rebuild affected skill before serving a cached projection.';

commit;
