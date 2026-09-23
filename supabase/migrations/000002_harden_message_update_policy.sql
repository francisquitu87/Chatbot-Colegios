drop policy if exists messages_update_own on public.messages;

create policy messages_update_own on public.messages
for update using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  )
);
