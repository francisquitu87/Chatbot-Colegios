alter table public.generated_files
  add column source_definition jsonb,
  add column parent_generated_file_id uuid references public.generated_files(id) on delete restrict,
  add column version integer not null default 1 check (version > 0),
  add column superseded_at timestamptz;

create index generated_files_parent_idx on public.generated_files(parent_generated_file_id);
create index generated_files_current_idx on public.generated_files(conversation_id, superseded_at, created_at desc);

create or replace function public.generated_file_version_matches_parent()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.parent_generated_file_id is null then
    if new.version <> 1 then
      raise exception 'Root generated files must have version 1';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.generated_files parent
    where parent.id = new.parent_generated_file_id
      and parent.user_id = new.user_id
      and parent.conversation_id = new.conversation_id
      and parent.version = new.version - 1
  ) then
    raise exception 'Generated file parent does not match ownership or version';
  end if;
  return new;
end;
$$;

create trigger generated_files_version_parent_check
before insert or update of parent_generated_file_id, user_id, conversation_id, version
on public.generated_files
for each row execute function public.generated_file_version_matches_parent();

create policy generated_files_update_own on public.generated_files
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
