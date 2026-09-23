create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nuevo chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content jsonb not null,
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
  openai_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index conversations_user_last_message_idx on public.conversations(user_id, last_message_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_user_idx on public.messages(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at, updated_at = now()
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create trigger messages_touch_conversation
after insert or update on public.messages
for each row execute function public.touch_conversation_from_message();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_select_own on public.conversations
for select using (user_id = auth.uid());

create policy conversations_insert_own on public.conversations
for insert with check (user_id = auth.uid());

create policy conversations_update_own on public.conversations
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy conversations_delete_own on public.conversations
for delete using (user_id = auth.uid());

create policy messages_select_own on public.messages
for select using (user_id = auth.uid());

create policy messages_insert_own on public.messages
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

create policy messages_update_own on public.messages
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);

create policy messages_delete_own on public.messages
for delete using (user_id = auth.uid());
