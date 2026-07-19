-- RLS compatível com Firebase Auth JWT (sem exigir claim role:authenticated)
-- e is_admin() lendo perfil em firestore_docs (users/{uid}).

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
  )
  or exists (
    select 1
    from public.firestore_docs d
    where d.path = 'users/' || public.current_user_id()
      and d.data->>'role' = 'admin'
  );
$$;

drop policy if exists "firestore_docs_select_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_insert_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_update_auth" on public.firestore_docs;
drop policy if exists "firestore_docs_delete_auth" on public.firestore_docs;

-- Leitura pública (cursos, config, etc.) — igual ao Firestore aberto para leitura
create policy "firestore_docs_select_all"
  on public.firestore_docs for select
  using (true);

-- Escrita exige usuário logado (Firebase JWT com sub)
create policy "firestore_docs_insert_auth"
  on public.firestore_docs for insert
  with check (public.current_user_id() is not null);

create policy "firestore_docs_update_auth"
  on public.firestore_docs for update
  using (public.current_user_id() is not null)
  with check (public.current_user_id() is not null);

create policy "firestore_docs_delete_auth"
  on public.firestore_docs for delete
  using (
    public.is_admin()
    or path like ('users/' || public.current_user_id() || '/%')
  );
