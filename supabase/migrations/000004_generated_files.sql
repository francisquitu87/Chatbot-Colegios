insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-files',
  'generated-files',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.generated_files (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  tool_execution_id uuid,
  storage_bucket text not null default 'generated-files',
  storage_path text not null unique,
  filename text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index generated_files_user_created_idx on public.generated_files(user_id, created_at desc);
create index generated_files_conversation_created_idx on public.generated_files(conversation_id, created_at desc);
create index generated_files_message_idx on public.generated_files(message_id);

alter table public.generated_files enable row level security;

create policy generated_files_select_own on public.generated_files
for select using (user_id = auth.uid());

create policy generated_files_insert_own on public.generated_files
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
  and (
    message_id is null
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.user_id = auth.uid() and m.conversation_id = conversation_id
    )
  )
);

create policy generated_files_delete_own on public.generated_files
for delete using (user_id = auth.uid());

create policy generated_files_insert_own_object on storage.objects
for insert to authenticated
with check (
  bucket_id = 'generated-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy generated_files_select_own_object on storage.objects
for select to authenticated
using (
  bucket_id = 'generated-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy generated_files_delete_own_object on storage.objects
for delete to authenticated
using (
  bucket_id = 'generated-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
