-- Espelho Firestore + IDs text (Firebase UID) + auth Firebase third-party

-- ---------------------------------------------------------------------------
-- Remove policies que impedem ALTER COLUMN
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

drop policy if exists "generation_jobs_select_own_or_admin" on public.generation_jobs;
drop policy if exists "generation_jobs_insert_own" on public.generation_jobs;
drop policy if exists "generation_jobs_update_own_or_admin" on public.generation_jobs;
drop policy if exists "generation_jobs_delete_own_or_admin" on public.generation_jobs;

drop policy if exists "content_feedback_select_own_or_admin" on public.content_feedback;
drop policy if exists "content_feedback_insert_own_flag" on public.content_feedback;
drop policy if exists "content_feedback_admin_write" on public.content_feedback;
drop policy if exists "content_feedback_admin_delete" on public.content_feedback;

drop policy if exists "content_comments_select_auth" on public.content_comments;
drop policy if exists "content_comments_insert_own" on public.content_comments;
drop policy if exists "content_comments_update_own_or_admin" on public.content_comments;
drop policy if exists "content_comments_delete_own_or_admin" on public.content_comments;

drop policy if exists "user_notifications_own" on public.user_notifications;
drop policy if exists "course_user_schedules_own" on public.course_user_schedules;
drop policy if exists "user_trilha_own" on public.user_trilha;
drop policy if exists "user_trilha_sessions_own" on public.user_trilha_sessions;
drop policy if exists "user_study_sessions_own" on public.user_study_sessions;
drop policy if exists "user_profile_posts_select_auth" on public.user_profile_posts;
drop policy if exists "user_profile_posts_write_own" on public.user_profile_posts;
drop policy if exists "course_entitlements_select_own_or_admin" on public.course_entitlements;

-- ---------------------------------------------------------------------------
-- IDs text (Firebase UID) — remove FKs antes de alterar tipos
-- ---------------------------------------------------------------------------

alter table if exists public.generation_active_jobs drop constraint if exists generation_active_jobs_job_id_fkey;
alter table if exists public.generation_active_jobs drop constraint if exists generation_active_jobs_user_id_fkey;
alter table if exists public.generation_resume_queue drop constraint if exists generation_resume_queue_job_id_fkey;
alter table if exists public.generation_resume_queue drop constraint if exists generation_resume_queue_user_id_fkey;
alter table if exists public.generation_checkpoints drop constraint if exists generation_checkpoints_job_id_fkey;
alter table if exists public.generation_jobs drop constraint if exists generation_jobs_user_id_fkey;
alter table if exists public.generation_jobs drop constraint if exists generation_jobs_course_id_fkey;
alter table if exists public.content_feedback drop constraint if exists content_feedback_user_id_fkey;
alter table if exists public.content_feedback drop constraint if exists content_feedback_course_id_fkey;
alter table if exists public.content_comments drop constraint if exists content_comments_user_id_fkey;
alter table if exists public.content_comments drop constraint if exists content_comments_course_id_fkey;
alter table if exists public.content_comment_votes drop constraint if exists content_comment_votes_comment_id_fkey;
alter table if exists public.content_comment_votes drop constraint if exists content_comment_votes_voter_id_fkey;
alter table if exists public.course_user_schedules drop constraint if exists course_user_schedules_user_id_fkey;
alter table if exists public.course_flashcards drop constraint if exists course_flashcards_user_id_fkey;
alter table if exists public.course_entitlements drop constraint if exists course_entitlements_user_id_fkey;
alter table if exists public.user_notifications drop constraint if exists user_notifications_user_id_fkey;
alter table if exists public.user_trilha drop constraint if exists user_trilha_user_id_fkey;
alter table if exists public.user_trilha_sessions drop constraint if exists user_trilha_sessions_user_id_fkey;
alter table if exists public.user_study_sessions drop constraint if exists user_study_sessions_user_id_fkey;
alter table if exists public.user_profile_posts drop constraint if exists user_profile_posts_user_id_fkey;

alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles alter column id type text using id::text;

alter table public.course_user_schedules alter column user_id type text using user_id::text;
alter table public.course_flashcards alter column user_id type text using user_id::text;
alter table public.generation_jobs alter column user_id type text using user_id::text;
alter table public.generation_active_jobs alter column user_id type text using user_id::text;
alter table public.generation_resume_queue alter column user_id type text using user_id::text;
alter table public.content_feedback alter column user_id type text using user_id::text;
alter table public.content_comments alter column user_id type text using user_id::text;
alter table public.content_comment_votes alter column voter_id type text using voter_id::text;
alter table public.user_notifications alter column user_id type text using user_id::text;
alter table public.user_trilha alter column user_id type text using user_id::text;
alter table public.user_trilha_sessions alter column user_id type text using user_id::text;
alter table public.user_study_sessions alter column user_id type text using user_id::text;
alter table public.user_profile_posts alter column user_id type text using user_id::text;
alter table public.course_entitlements alter column user_id type text using user_id::text;

-- ---------------------------------------------------------------------------
-- Espelho genérico de documentos Firestore (path → jsonb)
-- ---------------------------------------------------------------------------

create table if not exists public.firestore_docs (
  path text primary key,
  parent_path text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists firestore_docs_parent_path_idx on public.firestore_docs (parent_path);
create index if not exists firestore_docs_doc_id_idx on public.firestore_docs (doc_id);
create index if not exists firestore_docs_data_gin_idx on public.firestore_docs using gin (data);
create index if not exists firestore_docs_updated_at_idx on public.firestore_docs (updated_at desc);

drop trigger if exists firestore_docs_updated_at on public.firestore_docs;
create trigger firestore_docs_updated_at
  before update on public.firestore_docs
  for each row execute function public.touch_updated_at();

-- Helper: UID do JWT (Firebase sub ou Supabase auth uid)
create or replace function public.current_user_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'sub', ''),
    nullif(auth.jwt() ->> 'user_id', ''),
    auth.uid()::text
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = public.current_user_id()
      and p.role = 'admin'
  );
$$;

alter table public.firestore_docs enable row level security;

drop policy if exists "firestore_docs_select_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_insert_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_update_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_delete_auth" on public.firestore_docs;

create policy "firestore_docs_select_auth"
  on public.firestore_docs for select to authenticated
  using (true);

create policy "firestore_docs_insert_auth"
  on public.firestore_docs for insert to authenticated
  with check (true);

create policy "firestore_docs_update_auth"
  on public.firestore_docs for update to authenticated
  using (true)
  with check (true);

create policy "firestore_docs_delete_auth"
  on public.firestore_docs for delete to authenticated
  using (public.is_admin() or path like ('users/' || public.current_user_id() || '/%'));

-- Recria policies com current_user_id() (text / Firebase UID)
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = public.current_user_id() and role <> 'admin');
create policy "profiles_update_own_or_admin"
  on public.profiles for update to authenticated
  using (id = public.current_user_id() or public.is_admin())
  with check (
    public.is_admin()
    or (id = public.current_user_id() and role = (select p.role from public.profiles p where p.id = public.current_user_id()))
  );
create policy "profiles_delete_admin"
  on public.profiles for delete to authenticated
  using (public.is_admin());

create policy "generation_jobs_select_own_or_admin"
  on public.generation_jobs for select to authenticated
  using (user_id = public.current_user_id() or public.is_admin());
create policy "generation_jobs_insert_own"
  on public.generation_jobs for insert to authenticated
  with check (
    user_id = public.current_user_id()
    and (run_on_server = false or public.is_admin())
  );
create policy "generation_jobs_update_own_or_admin"
  on public.generation_jobs for update to authenticated
  using (
    public.is_admin()
    or (user_id = public.current_user_id() and run_on_server = false)
  )
  with check (
    public.is_admin()
    or (user_id = public.current_user_id() and run_on_server = false)
  );
create policy "generation_jobs_delete_own_or_admin"
  on public.generation_jobs for delete to authenticated
  using (user_id = public.current_user_id() or public.is_admin());

create policy "content_feedback_select_own_or_admin"
  on public.content_feedback for select to authenticated
  using (user_id = public.current_user_id() or public.is_admin());
create policy "content_feedback_insert_own_flag"
  on public.content_feedback for insert to authenticated
  with check (user_id = public.current_user_id() and kind = 'flag');
create policy "content_feedback_admin_write"
  on public.content_feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "content_feedback_admin_delete"
  on public.content_feedback for delete to authenticated
  using (public.is_admin());

create policy "content_comments_select_auth"
  on public.content_comments for select to authenticated
  using (true);
create policy "content_comments_insert_own"
  on public.content_comments for insert to authenticated
  with check (user_id = public.current_user_id());
create policy "content_comments_update_own_or_admin"
  on public.content_comments for update to authenticated
  using (user_id = public.current_user_id() or public.is_admin());
create policy "content_comments_delete_own_or_admin"
  on public.content_comments for delete to authenticated
  using (user_id = public.current_user_id() or public.is_admin());

create policy "user_notifications_own"
  on public.user_notifications for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() or public.is_admin());

create policy "course_user_schedules_own"
  on public.course_user_schedules for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy "user_trilha_own"
  on public.user_trilha for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() or public.is_admin());

create policy "user_trilha_sessions_own"
  on public.user_trilha_sessions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() or public.is_admin());

create policy "user_study_sessions_own"
  on public.user_study_sessions for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() or public.is_admin());

create policy "user_profile_posts_select_auth"
  on public.user_profile_posts for select to authenticated
  using (true);
create policy "user_profile_posts_write_own"
  on public.user_profile_posts for all to authenticated
  using (user_id = public.current_user_id() or public.is_admin())
  with check (user_id = public.current_user_id() or public.is_admin());

create policy "course_entitlements_select_own_or_admin"
  on public.course_entitlements for select to authenticated
  using (user_id = public.current_user_id() or public.is_admin());

-- Realtime para o espelho
do $$
begin
  alter publication supabase_realtime add table public.firestore_docs;
exception
  when duplicate_object then null;
end $$;
