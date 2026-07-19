-- Webhook Supabase → Vercel para substituir Firestore triggers (firestore_docs).
-- Configure SUPABASE_WEBHOOK_SECRET e NEXT_PUBLIC_SITE_URL no Vercel.
-- Ajuste a URL abaixo se o domínio de produção for diferente.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_firestore_docs_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  webhook_url text := coalesce(
    current_setting('app.webhook_base_url', true),
    'https://www.flashconcards.com.br'
  ) || '/api/webhooks/supabase-db';
  webhook_secret text := current_setting('app.webhook_secret', true);
begin
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', case when TG_OP = 'UPDATE' then row_to_json(OLD) else null end
  );

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(webhook_secret, '')
    ),
    body := payload
  );

  return NEW;
end;
$$;

drop trigger if exists firestore_docs_webhook_insert on public.firestore_docs;
drop trigger if exists firestore_docs_webhook_update on public.firestore_docs;

create trigger firestore_docs_webhook_insert
  after insert on public.firestore_docs
  for each row execute function public.notify_firestore_docs_webhook();

create trigger firestore_docs_webhook_update
  after update on public.firestore_docs
  for each row execute function public.notify_firestore_docs_webhook();
