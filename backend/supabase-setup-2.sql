-- HomeHub photos and voice messages. Paste into Supabase > SQL Editor > New query, then Run.
-- (Run this after supabase-setup.sql.)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880,
        array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg','audio/mpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only members of a household can read or add files in that household's folder.
drop policy if exists "household media read" on storage.objects;
create policy "household media read" on storage.objects for select to authenticated
  using (bucket_id = 'media'
         and (storage.foldername(name))[1] in
             (select household_id::text from public.household_members where user_id = auth.uid()));

drop policy if exists "household media insert" on storage.objects;
create policy "household media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media'
         and (storage.foldername(name))[1] in
             (select household_id::text from public.household_members where user_id = auth.uid()));
