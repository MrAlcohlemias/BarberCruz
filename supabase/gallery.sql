-- Barber Cruz · add the public haircut gallery to an existing project.
-- Run in Supabase SQL Editor as the project owner. Existing data is preserved.
begin;

-- Public gallery. Metadata never contains an arbitrary URL or an account ID.
create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  object_path text not null unique check (
    object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  ),
  caption text not null default '' check (char_length(caption) <= 120),
  created_at timestamptz not null default now()
);
alter table public.gallery_photos enable row level security;
revoke all on public.gallery_photos from anon, authenticated;
grant select on public.gallery_photos to anon, authenticated;
grant insert(object_path, caption), delete on public.gallery_photos to authenticated;

drop policy if exists barber_cruz_gallery_read on public.gallery_photos;
create policy barber_cruz_gallery_read on public.gallery_photos for select to anon, authenticated
  using (true);
drop policy if exists barber_cruz_gallery_insert on public.gallery_photos;
drop policy if exists barber_cruz_gallery_delete on public.gallery_photos;
create policy barber_cruz_gallery_delete on public.gallery_photos for delete to authenticated
  using (public.is_admin());

-- Unlike profile photos, haircut photos are public showcase images. Uploads
-- use new UUID filenames, never upsert; no customer can write or overwrite them.
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('haircuts', 'haircuts', true, 2097152, array['image/jpeg'])
    on conflict (id) do update set
      public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists barber_cruz_haircuts_read on storage.objects;
    create policy barber_cruz_haircuts_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'haircuts');
    drop policy if exists barber_cruz_haircuts_insert on storage.objects;
    create policy barber_cruz_haircuts_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'haircuts' and public.is_admin() and
        name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      );
    drop policy if exists barber_cruz_haircuts_delete on storage.objects;
    create policy barber_cruz_haircuts_delete on storage.objects for delete to authenticated
      using (bucket_id = 'haircuts' and public.is_admin());

    -- Publish metadata only after the matching object was uploaded successfully.
    create policy barber_cruz_gallery_insert on public.gallery_photos for insert to authenticated
      with check (public.is_admin() and exists (
        select 1 from storage.objects o
        where o.bucket_id = 'haircuts' and o.name = gallery_photos.object_path
      ));
  else
    raise notice 'Supabase Storage is absent: gallery uploads remain disabled in this PostgreSQL installation.';
  end if;
end;
$$;

-- Include the gallery without changing any publication's existing tables.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gallery_photos'
  ) then
    alter publication supabase_realtime add table public.gallery_photos;
  end if;
end;
$$;

commit;
