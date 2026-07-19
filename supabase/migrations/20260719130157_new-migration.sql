-- Flashconcards: schema inicial (migração Firestore → Supabase)
-- Coleções mapeadas a partir de firestore.rules e uso no app/functions.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (Firestore: users/{userId})
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'student' check (role in ('student', 'admin', 'teacher')),
  photo_url text,
  favorites jsonb not null default '[]'::jsonb,
  has_active_subscription boolean not null default false,
  subscription_start_date timestamptz,
  email_verified boolean not null default false,
  push_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Courses (Firestore: courses/{courseId} + subcoleções)
-- ---------------------------------------------------------------------------

create table public.courses (
  id text primary key,
  title text,
  slug text,
  status text not null default 'disponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_status_idx on public.courses (status);
create index courses_slug_idx on public.courses (slug);

create trigger courses_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

create table public.course_subjects (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_prompts (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_config (
  course_id text not null references public.courses (id) on delete cascade,
  config_key text not null,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, config_key)
);

create table public.course_cronograma (
  course_id text not null references public.courses (id) on delete cascade,
  month_key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, month_key)
);

create table public.course_user_schedules (
  course_id text not null,
  month_key text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, month_key, user_id),
  foreign key (course_id, month_key)
    references public.course_cronograma (course_id, month_key)
    on delete cascade
);

create table public.course_mentorado_automation (
  course_id text not null references public.courses (id) on delete cascade,
  date_key text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, date_key)
);

create table public.course_flashcards (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  status text not null default 'indisponivel',
  user_id uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create index course_flashcards_topic_idx on public.course_flashcards (course_id, topic_key);
create index course_flashcards_status_idx on public.course_flashcards (course_id, status);

create table public.course_questoes (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_questoes_topico (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_materias_revisadas (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_conteudos_completos (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_topico_status (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  topic_key text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_material_apoio (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  status text not null default 'indisponivel',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_edital_verticalizado (
  id text not null,
  course_id text not null references public.courses (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, id)
);

create table public.course_edital_partes (
  id text not null,
  course_id text not null,
  edital_id text not null,
  parte integer,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, edital_id, id),
  foreign key (course_id, edital_id)
    references public.course_edital_verticalizado (course_id, id)
    on delete cascade
);

-- ---------------------------------------------------------------------------
-- Generation pipeline
-- ---------------------------------------------------------------------------

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text references public.courses (id) on delete set null,
  job_type text not null,
  topic_key text,
  status text not null default 'pending',
  progress numeric not null default 0,
  message text,
  run_on_server boolean not null default false,
  server_payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error jsonb,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index generation_jobs_user_status_idx
  on public.generation_jobs (user_id, status, updated_at desc);
create index generation_jobs_course_type_idx
  on public.generation_jobs (course_id, job_type, status);

create trigger generation_jobs_updated_at
  before update on public.generation_jobs
  for each row execute function public.touch_updated_at();

create table public.generation_checkpoints (
  course_id text not null references public.courses (id) on delete cascade,
  doc_id text not null,
  topic_key text,
  asset_type text,
  job_id uuid references public.generation_jobs (id) on delete set null,
  complete boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, doc_id)
);

create table public.generation_active_jobs (
  job_id uuid primary key references public.generation_jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text,
  job_type text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generation_resume_queue (
  job_id uuid primary key references public.generation_jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting',
  next_run_at timestamptz,
  attempt_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index generation_resume_queue_next_run_idx
  on public.generation_resume_queue (status, next_run_at);

-- ---------------------------------------------------------------------------
-- Content feedback / comments (Moderação + Professor IA)
-- ---------------------------------------------------------------------------

create table public.content_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'flag',
  content_type text not null,
  content_id text not null,
  status text not null default 'open',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_feedback_course_status_idx
  on public.content_feedback (course_id, status, created_at desc);
create index content_feedback_user_idx
  on public.content_feedback (user_id, created_at desc);

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null,
  content_id text not null,
  text text not null,
  likes integer not null default 0,
  dislikes integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_comment_votes (
  comment_id uuid not null references public.content_comments (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, voter_id)
);

-- ---------------------------------------------------------------------------
-- Professor supervisor
-- ---------------------------------------------------------------------------

create table public.professor_supervisor_reviews (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professor_supervisor_history (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.professor_supervisor_queue (
  id uuid primary key default gen_random_uuid(),
  course_id text references public.courses (id) on delete set null,
  status text not null default 'pending',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index professor_supervisor_queue_status_idx
  on public.professor_supervisor_queue (status, updated_at);

-- ---------------------------------------------------------------------------
-- User-scoped data (subcoleções de users)
-- ---------------------------------------------------------------------------

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_trilha (
  user_id uuid not null references public.profiles (id) on delete cascade,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);

create table public.user_trilha_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.user_study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profile_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Global / misc collections (JSONB document store)
-- ---------------------------------------------------------------------------

create table public.app_config (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_entitlements (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id text references public.courses (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index course_entitlements_user_idx on public.course_entitlements (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (espelho simplificado de firestore.rules)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_subjects enable row level security;
alter table public.course_prompts enable row level security;
alter table public.course_config enable row level security;
alter table public.course_cronograma enable row level security;
alter table public.course_user_schedules enable row level security;
alter table public.course_mentorado_automation enable row level security;
alter table public.course_flashcards enable row level security;
alter table public.course_questoes enable row level security;
alter table public.course_questoes_topico enable row level security;
alter table public.course_materias_revisadas enable row level security;
alter table public.course_conteudos_completos enable row level security;
alter table public.course_topico_status enable row level security;
alter table public.course_material_apoio enable row level security;
alter table public.course_edital_verticalizado enable row level security;
alter table public.course_edital_partes enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_checkpoints enable row level security;
alter table public.generation_active_jobs enable row level security;
alter table public.generation_resume_queue enable row level security;
alter table public.content_feedback enable row level security;
alter table public.content_comments enable row level security;
alter table public.content_comment_votes enable row level security;
alter table public.professor_supervisor_reviews enable row level security;
alter table public.professor_supervisor_history enable row level security;
alter table public.professor_supervisor_queue enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_trilha enable row level security;
alter table public.user_trilha_sessions enable row level security;
alter table public.user_study_sessions enable row level security;
alter table public.user_profile_posts enable row level security;
alter table public.app_config enable row level security;
alter table public.site_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.course_entitlements enable row level security;

-- profiles
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and role <> 'admin');
create policy "profiles_update_own_or_admin"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()))
  );
create policy "profiles_delete_admin"
  on public.profiles for delete to authenticated
  using (public.is_admin());

-- courses (leitura pública)
create policy "courses_select_public"
  on public.courses for select
  using (true);
create policy "courses_write_admin"
  on public.courses for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- generation jobs
create policy "generation_jobs_select_own_or_admin"
  on public.generation_jobs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "generation_jobs_insert_own"
  on public.generation_jobs for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      run_on_server = false
      or public.is_admin()
    )
  );
create policy "generation_jobs_update_own_or_admin"
  on public.generation_jobs for update to authenticated
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and run_on_server = false
    )
  )
  with check (
    public.is_admin()
    or (
      user_id = auth.uid()
      and run_on_server = false
    )
  );
create policy "generation_jobs_delete_own_or_admin"
  on public.generation_jobs for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- content feedback
create policy "content_feedback_select_own_or_admin"
  on public.content_feedback for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "content_feedback_insert_own_flag"
  on public.content_feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and kind = 'flag'
  );
create policy "content_feedback_admin_write"
  on public.content_feedback for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "content_feedback_admin_delete"
  on public.content_feedback for delete to authenticated
  using (public.is_admin());

-- content comments
create policy "content_comments_select_auth"
  on public.content_comments for select to authenticated
  using (true);
create policy "content_comments_insert_own"
  on public.content_comments for insert to authenticated
  with check (user_id = auth.uid());
create policy "content_comments_update_own_or_admin"
  on public.content_comments for update to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "content_comments_delete_own_or_admin"
  on public.content_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- professor supervisor (admin only)
create policy "professor_supervisor_admin"
  on public.professor_supervisor_reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "professor_supervisor_history_admin"
  on public.professor_supervisor_history for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "professor_supervisor_queue_admin"
  on public.professor_supervisor_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user notifications
create policy "user_notifications_own"
  on public.user_notifications for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() or public.is_admin());

-- site settings (leitura pública)
create policy "site_settings_select_public"
  on public.site_settings for select
  using (true);
create policy "site_settings_admin_write"
  on public.site_settings for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- app config
create policy "app_config_select_auth"
  on public.app_config for select to authenticated
  using (true);
create policy "app_config_admin_write"
  on public.app_config for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- course entitlements
create policy "course_entitlements_select_own_or_admin"
  on public.course_entitlements for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Admin policies for course sub-resources (simplified)
do $$
declare
  t text;
begin
  foreach t in array array[
    'course_subjects',
    'course_prompts',
    'course_config',
    'course_cronograma',
    'course_mentorado_automation',
    'course_flashcards',
    'course_questoes',
    'course_questoes_topico',
    'course_materias_revisadas',
    'course_conteudos_completos',
    'course_topico_status',
    'course_material_apoio',
    'course_edital_verticalizado',
    'course_edital_partes',
    'generation_checkpoints',
    'generation_active_jobs',
    'generation_resume_queue'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t
    );
  end loop;
end $$;

create policy "course_user_schedules_own"
  on public.course_user_schedules for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_trilha_own"
  on public.user_trilha for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() or public.is_admin());

create policy "user_trilha_sessions_own"
  on public.user_trilha_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() or public.is_admin());

create policy "user_study_sessions_own"
  on public.user_study_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() or public.is_admin());

create policy "user_profile_posts_select_auth"
  on public.user_profile_posts for select to authenticated
  using (true);
create policy "user_profile_posts_write_own"
  on public.user_profile_posts for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- service role bypasses RLS; generation pipeline writes via Edge Functions
