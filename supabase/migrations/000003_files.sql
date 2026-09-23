insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  6291456,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.files (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  storage_bucket text not null default 'chat-files',
  storage_path text not null unique,
  original_name text not null,
  sanitized_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 6291456),
  extension text not null,
  status text not null default 'uploaded' check (status in ('uploading', 'uploaded', 'failed', 'deleted', 'processing', 'ready', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index files_user_created_idx on public.files(user_id, created_at desc);
create index files_conversation_created_idx on public.files(conversation_id, created_at desc);
create index files_user_status_idx on public.files(user_id, status);

create trigger files_set_updated_at
before update on public.files
for each row execute function public.set_updated_at();

alter table public.files enable row level security;

create policy files_select_own on public.files
for select using (user_id = auth.uid());

create policy files_insert_own on public.files
for insert with check (
  user_id = auth.uid()
  and (
    conversation_id is null
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
);

create policy files_update_own on public.files
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (
    conversation_id is null
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
);

create policy files_delete_own on public.files
for delete using (user_id = auth.uid());

create policy chat_files_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy chat_files_select_own_folder on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy chat_files_update_own_folder on storage.objects
for update to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy chat_files_delete_own_folder on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
