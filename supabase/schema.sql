-- Barber Cruz · run in the Supabase SQL editor as the project owner.
-- Re-running this file preserves existing services, settings and appointments.
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 100),
  email text not null default '',
  avatar text not null default '' check (char_length(avatar) <= 2048),
  bio text not null default '' check (char_length(bio) <= 500),
  preferred_style text not null default '' check (char_length(preferred_style) <= 150),
  role text not null default 'customer' check (role in ('customer', 'admin')),
  deletion_pending boolean not null default false
);

-- Server-only deletion guard. Old installations gain the column without losing
-- profiles; browser clients never receive permission to change it.
alter table public.profiles add column if not exists deletion_pending boolean not null default false;

create table if not exists public.services (
  id text primary key,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  duration integer not null check (duration between 5 and 240),
  price numeric(8,2) not null check (price between 0 and 10000),
  icon text not null check (icon in ('scissors', 'razor', 'combo'))
);

create table if not exists public.settings (
  id text primary key check (id = 'singleton'),
  payload jsonb not null
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  note text not null default '' check (char_length(note) <= 500),
  check (ends_at > starts_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id text not null references public.services(id) on delete restrict,
  date date not null,
  time time without time zone not null,
  -- Snapshot: changing a service's duration never shortens an existing booking.
  duration integer not null check (duration between 5 and 240),
  -- Snapshot: historical revenue must not change when the catalogue is edited.
  price numeric(8,2) not null default 0 check (price between 0 and 10000),
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  redemption boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- Upgrade projects created before price snapshots existed. Earlier prices cannot
-- be reconstructed: only these legacy rows are initialized from today's catalogue.
-- Temporarily pause our validation trigger for this owner-only migration, keeping
-- its previous mode. Everything is transactional; no client receives this bypass.
do $$
declare previous_trigger_mode text;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.appointments'::regclass and attname = 'price' and not attisdropped
  ) then
    alter table public.appointments add column price numeric(8,2) default 0;
    select tgenabled::text into previous_trigger_mode from pg_trigger
      where tgrelid = 'public.appointments'::regclass and tgname = 'barber_cruz_validate_appointment';
    if previous_trigger_mode is not null and previous_trigger_mode <> 'D' then
      alter table public.appointments disable trigger barber_cruz_validate_appointment;
    end if;
    update public.appointments a set price = case when a.redemption then 0 else s.price end
      from public.services s where a.service_id = s.id;
    if previous_trigger_mode = 'O' then
      alter table public.appointments enable trigger barber_cruz_validate_appointment;
    elsif previous_trigger_mode = 'A' then
      alter table public.appointments enable always trigger barber_cruz_validate_appointment;
    elsif previous_trigger_mode = 'R' then
      alter table public.appointments enable replica trigger barber_cruz_validate_appointment;
    end if;
    alter table public.appointments alter column price set not null;
    alter table public.appointments add constraint appointments_price_check check (price between 0 and 10000);
  end if;
end;
$$;

create index if not exists appointments_date_active_idx on public.appointments(date, time)
  where status in ('confirmed', 'completed');
create index if not exists appointments_user_idx on public.appointments(user_id, date);
create index if not exists blocks_date_idx on public.blocks(date);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- No role is ever read from OAuth metadata supplied by a user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, name, email, avatar)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Cliente'), 100),
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''), 2048)
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists barber_cruz_new_user on auth.users;
create trigger barber_cruz_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- If OAuth was configured before this schema, create those profiles as well.
insert into public.profiles(id, name, email, avatar)
select id,
  left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', 'Cliente'), 100),
  coalesce(email, ''),
  left(coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture', ''), 2048)
from auth.users on conflict (id) do nothing;

-- Keep durable Storage references in the owning profile. Signed download URLs
-- expire and must be resolved by the client, rather than saved in this column.
-- Google HTTPS photos and the existing emoji avatars remain compatible.
create or replace function public.validate_profile_avatar()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.avatar like 'avatars/%' and new.avatar !~ (
    '^avatars/' || new.id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ) then
    raise exception 'La foto de perfil debe pertenecer a esta cuenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists barber_cruz_validate_profile_avatar on public.profiles;
create trigger barber_cruz_validate_profile_avatar before insert or update of avatar on public.profiles
  for each row execute function public.validate_profile_avatar();

create or replace function public.validate_profile_deletion()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.deletion_pending and new.role <> 'customer' then
    raise exception 'Las cuentas de administrador no se pueden eliminar desde la web.';
  end if;
  if tg_op = 'UPDATE' and old.deletion_pending and new.role is distinct from old.role then
    raise exception 'Termina o cancela la eliminación antes de cambiar el rol.';
  end if;
  return new;
end;
$$;

drop trigger if exists barber_cruz_validate_profile_deletion on public.profiles;
create trigger barber_cruz_validate_profile_deletion before insert or update of role, deletion_pending on public.profiles
  for each row execute function public.validate_profile_deletion();

-- Only the Edge Function's server client may call these functions. Lock both
-- live profiles in UUID order, then validate roles again inside the transaction.
-- This prevents a role change between authorization and avatar cleanup.
create or replace function public.prepare_account_deletion(p_actor_id uuid, p_target_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor public.profiles; target public.profiles;
begin
  perform id from public.profiles where id in (p_actor_id, p_target_id) order by id for update;
  select * into actor from public.profiles where id = p_actor_id;
  select * into target from public.profiles where id = p_target_id;
  if actor.id is null or target.id is null or target.role <> 'customer'
    or (actor.role <> 'admin' and actor.id <> target.id) then
    raise exception 'No tienes permiso para eliminar esta cuenta.';
  end if;
  if target.deletion_pending then
    raise exception 'La eliminación de esta cuenta ya está en curso.';
  end if;
  update public.profiles set deletion_pending = true where id = p_target_id;
end;
$$;

create or replace function public.release_account_deletion(p_target_id uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.profiles set deletion_pending = false where id = p_target_id and role = 'customer';
$$;

-- Hold a shared row lock while Storage creates its metadata, so a pending
-- upload finishes before deletion starts and no new upload starts afterwards.
create or replace function public.can_store_avatar()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare pending boolean;
begin
  select deletion_pending into pending from public.profiles where id = auth.uid() for share;
  return pending is not null and not pending;
end;
$$;

create or replace function public.validate_settings()
returns trigger language plpgsql set search_path = ''
as $$
declare
  day_number integer;
  hours jsonb;
begin
  if new.payload ->> 'timezone' is distinct from 'Europe/Madrid' then
    raise exception 'La zona horaria debe ser Europe/Madrid.';
  end if;
  if not (new.payload ?& array['shopName', 'instagram', 'openingHours', 'slotStep', 'advanceDays', 'requiredCuts'])
    or jsonb_typeof(new.payload -> 'openingHours') is distinct from 'object'
    or jsonb_typeof(new.payload -> 'shopName') is distinct from 'string'
    or char_length(new.payload ->> 'shopName') not between 1 and 100
    or jsonb_typeof(new.payload -> 'instagram') is distinct from 'string'
    or char_length(new.payload ->> 'instagram') > 2000
    or jsonb_typeof(new.payload -> 'slotStep') is distinct from 'number'
    or jsonb_typeof(new.payload -> 'advanceDays') is distinct from 'number'
    or jsonb_typeof(new.payload -> 'requiredCuts') is distinct from 'number'
    or coalesce(new.payload ->> 'slotStep', '') !~ '^[0-9]+$'
    or coalesce(new.payload ->> 'advanceDays', '') !~ '^[0-9]+$'
    or coalesce(new.payload ->> 'requiredCuts', '') !~ '^[0-9]+$' then
    raise exception 'La configuración tiene campos no válidos.';
  end if;
  if (new.payload ->> 'slotStep')::integer not between 5 and 120
    or (new.payload ->> 'advanceDays')::integer not between 1 and 365
    or (new.payload ->> 'requiredCuts')::integer not between 1 and 50 then
    raise exception 'Revisa el intervalo, los días de antelación y los cortes necesarios.';
  end if;
  for day_number in 0..6 loop
    hours := new.payload -> 'openingHours' -> day_number::text;
    if hours is null or jsonb_typeof(hours -> 'open') is distinct from 'boolean'
      or coalesce(hours ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(hours ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or ((hours ->> 'open')::boolean and (hours ->> 'start')::time >= (hours ->> 'end')::time) then
      raise exception 'Horario no válido para el día %.', day_number;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists barber_cruz_validate_settings on public.settings;
create trigger barber_cruz_validate_settings before insert or update on public.settings
  for each row execute function public.validate_settings();

insert into public.services(id, name, description, duration, price, icon) values
  ('cut', 'Corte de pelo', 'Degradado, clásico o tu propio estilo. Tú eliges.', 45, 7, 'scissors')
on conflict (id) do nothing;

insert into public.settings(id, payload) values ('singleton', '{
  "shopName": "Barber Cruz",
  "instagram": "https://www.instagram.com/_barbercruz_/",
  "openingHours": {
    "0": {"open": false, "start": "10:00", "end": "14:00"},
    "1": {"open": true, "start": "10:00", "end": "20:00"},
    "2": {"open": true, "start": "10:00", "end": "20:00"},
    "3": {"open": true, "start": "10:00", "end": "20:00"},
    "4": {"open": true, "start": "10:00", "end": "20:00"},
    "5": {"open": true, "start": "10:00", "end": "20:00"},
    "6": {"open": true, "start": "10:00", "end": "20:00"}
  },
  "slotStep": 15,
  "advanceDays": 30,
  "requiredCuts": 7,
  "timezone": "Europe/Madrid"
}'::jsonb) on conflict (id) do nothing;

-- Lock order is always user, then date(s). Serialize loyalty reservations across
-- different dates, and bookings/blocks across all users on the same date.
create or replace function public.validate_appointment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  admin_actor boolean := public.is_admin();
  config jsonb;
  hours jsonb;
  selected_service public.services%rowtype;
  schedule_changed boolean;
  local_today date;
  booking_start timestamp without time zone;
  booking_end timestamp without time zone;
  step_minutes integer;
  paid_cuts integer;
  used_rewards integer;
begin
  if actor is null then raise exception 'Inicia sesión para gestionar las citas.'; end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'No se puede cambiar el propietario ni el identificador de una cita.';
    end if;
    if new.price is distinct from old.price then
      raise exception 'El precio original de la cita no se puede modificar directamente.';
    end if;
    schedule_changed := new.date is distinct from old.date or new.time is distinct from old.time
      or new.service_id is distinct from old.service_id or new.redemption is distinct from old.redemption;
    if not admin_actor then
      if actor <> old.user_id or old.status <> 'confirmed' or new.status <> 'cancelled'
        or (old.date + old.time) at time zone 'Europe/Madrid' <= now()
        or schedule_changed or new.note is distinct from old.note
        or new.duration is distinct from old.duration then
        raise exception 'Solo puedes cancelar tus propias citas futuras.';
      end if;
    elsif old.status in ('completed', 'cancelled') and (
      new.status is distinct from old.status or schedule_changed or new.duration is distinct from old.duration
    ) then
      raise exception 'Las citas finalizadas no se pueden reabrir ni reprogramar.';
    end if;
    if new.status = 'completed' and old.status <> 'completed'
      and (new.date + new.time + make_interval(mins => new.duration)) at time zone 'Europe/Madrid' > now() then
      raise exception 'Espera a que termine la cita para marcarla como completada.';
    end if;
    if schedule_changed and new.status <> 'confirmed' then
      raise exception 'Solo se pueden reprogramar las citas confirmadas.';
    end if;
  else
    schedule_changed := true;
    if new.user_id <> actor or new.status <> 'confirmed' then
      raise exception 'La reserva debe pertenecer al usuario conectado y estar confirmada.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('barbercruz:user:' || new.user_id::text, 0));
  if tg_op = 'UPDATE' and old.date <> new.date then
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || least(old.date, new.date)::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || greatest(old.date, new.date)::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || new.date::text, 0));
  end if;

  if schedule_changed then
    select payload into config from public.settings where id = 'singleton' for share;
    if config is null then raise exception 'Falta la configuración de horarios.'; end if;
    select * into selected_service from public.services where id = new.service_id for share;
    if not found then raise exception 'El servicio no existe.'; end if;
    if tg_op = 'INSERT' then
      new.duration := selected_service.duration;
    elsif new.service_id is distinct from old.service_id then
      new.duration := selected_service.duration;
    elsif new.duration is distinct from old.duration then
      raise exception 'La duración original de la cita no se puede modificar.';
    end if;
    if tg_op = 'INSERT' then
      new.price := case when new.redemption then 0 else selected_service.price end;
    elsif new.service_id is distinct from old.service_id or new.redemption is distinct from old.redemption then
      new.price := case when new.redemption then 0 else selected_service.price end;
    end if;
    booking_start := new.date + new.time;
    booking_end := booking_start + make_interval(mins => new.duration);
    local_today := (now() at time zone (config ->> 'timezone'))::date;
    if booking_start at time zone (config ->> 'timezone') <= now()
      or new.date > local_today + (config ->> 'advanceDays')::integer then
      raise exception 'La cita debe estar en el futuro y dentro del plazo de reserva.';
    end if;
    hours := config -> 'openingHours' -> extract(dow from new.date)::integer::text;
    if not (hours ->> 'open')::boolean
      or new.time < (hours ->> 'start')::time
      or booking_end > new.date + (hours ->> 'end')::time then
      raise exception 'La cita no cabe dentro del horario de apertura.';
    end if;
    step_minutes := (config ->> 'slotStep')::integer;
    if extract(second from new.time) <> 0
      or mod(extract(epoch from (new.time - (hours ->> 'start')::time))::integer, step_minutes * 60) <> 0 then
      raise exception 'La hora no coincide con un turno disponible.';
    end if;
    if exists (
      select 1 from public.appointments a
      where a.id <> new.id and a.date = new.date and a.status in ('confirmed', 'completed')
        and a.date + a.time < booking_end
        and a.date + a.time + make_interval(mins => a.duration) > booking_start
    ) or exists (
      select 1 from public.blocks b where b.date = new.date
        and b.date + b.starts_at < booking_end and b.date + b.ends_at > booking_start
    ) then
      raise exception 'Ese turno acaba de ocuparse. Elige otra hora.';
    end if;

    if new.redemption then
      if new.service_id <> 'cut' then raise exception 'El regalo se aplica al corte de pelo.'; end if;
      select count(*) into paid_cuts from public.appointments
        where user_id = new.user_id and status = 'completed'
          and not redemption and service_id in ('cut', 'combo') and id <> new.id;
      select count(*) into used_rewards from public.appointments
        where user_id = new.user_id and redemption and status in ('confirmed', 'completed') and id <> new.id;
      if paid_cuts / (config ->> 'requiredCuts')::integer <= used_rewards then
        raise exception 'Todavía no tienes un corte gratis disponible.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists barber_cruz_validate_appointment on public.appointments;
create trigger barber_cruz_validate_appointment before insert or update on public.appointments
  for each row execute function public.validate_appointment();

create or replace function public.validate_block()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Solo el administrador puede bloquear horarios.'; end if;
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || old.date::text, 0));
    return old;
  end if;
  if tg_op = 'UPDATE' and old.date <> new.date then
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || least(old.date, new.date)::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || greatest(old.date, new.date)::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('barbercruz:date:' || new.date::text, 0));
  end if;
  if exists (
    select 1 from public.appointments a
    where a.date = new.date and a.status in ('confirmed', 'completed')
      and a.time < new.ends_at and a.time + make_interval(mins => a.duration) > new.starts_at
  ) then
    raise exception 'Hay una cita en ese intervalo. Cancélala o muévela antes de bloquearlo.';
  end if;
  return new;
end;
$$;

drop trigger if exists barber_cruz_validate_block on public.blocks;
create trigger barber_cruz_validate_block before insert or update or delete on public.blocks
  for each row execute function public.validate_block();

create or replace function public.book_appointment(
  p_service_id text,
  p_date date,
  p_time text,
  p_redemption boolean default false,
  p_note text default ''
)
returns public.appointments language plpgsql security definer set search_path = ''
as $$
declare
  result public.appointments;
begin
  if auth.uid() is null then raise exception 'Inicia sesión con Google para reservar.'; end if;
  perform id from public.profiles where id = auth.uid() and not deletion_pending for share;
  if not found then raise exception 'La eliminación de tu cuenta está en curso.'; end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'La hora debe tener formato HH:MM.';
  end if;
  insert into public.appointments(user_id, service_id, date, time, duration, redemption, note)
    values (auth.uid(), p_service_id, p_date, p_time::time, 45, coalesce(p_redemption, false), coalesce(p_note, ''))
    returning * into result;
  return result;
end;
$$;

-- Public availability exposes occupied times only: never IDs, clients, notes,
-- emails, services or loyalty information. Availability is checked again on insert.
create or replace function public.booked_intervals(p_date date)
returns table("time" text, duration integer)
language sql stable security definer set search_path = ''
as $$
  select to_char(a.time, 'HH24:MI'), a.duration
    from public.appointments a
    where a.date = p_date and a.status in ('confirmed', 'completed')
  union all
  select to_char(b.starts_at, 'HH24:MI'), ceil(extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer
    from public.blocks b where b.date = p_date;
$$;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.settings enable row level security;
alter table public.blocks enable row level security;
alter table public.appointments enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_edit_self on public.profiles;
drop policy if exists profiles_edit on public.profiles;
create policy profiles_edit on public.profiles for update to authenticated
  using (not deletion_pending and (id = auth.uid() or (role = 'customer' and public.is_admin())))
  with check (not deletion_pending and (id = auth.uid() or (role = 'customer' and public.is_admin())));
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to anon, authenticated using (true);
drop policy if exists services_admin_update on public.services;
create policy services_admin_update on public.services for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists services_admin_insert on public.services;
create policy services_admin_insert on public.services for insert to authenticated
  with check (public.is_admin());
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated using (true);
drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists blocks_admin on public.blocks;
create policy blocks_admin on public.blocks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
  using (public.is_admin() or (user_id = auth.uid() and status = 'confirmed'))
  with check (public.is_admin() or (user_id = auth.uid() and status = 'cancelled'));

-- Explicit column grants protect role, email, snapshots and booking ownership.
-- INSERT is only possible via book_appointment; completed/cancelled records cannot
-- be deleted or reopened, so a client cannot manufacture or erase reward credits.
revoke all on public.profiles, public.services, public.settings, public.blocks, public.appointments from anon, authenticated;
grant select on public.services, public.settings to anon, authenticated;
grant select on public.profiles, public.blocks, public.appointments to authenticated;
grant update(name, avatar, bio, preferred_style) on public.profiles to authenticated;
grant insert, update on public.services to authenticated;
grant update(payload) on public.settings to authenticated;
grant insert, update, delete on public.blocks to authenticated;
grant update(service_id, date, time, status, redemption, note) on public.appointments to authenticated;

-- Supabase owns the Storage schema. A private bucket needs a signed URL for
-- downloads: clients may read their own files, and the admin may read all photos.
-- Use unique filenames and upsert:false; uploads cannot overwrite another file.
-- Plain PostgreSQL test installations without Storage keep the booking schema.
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists barber_cruz_avatars_read on storage.objects;
    create policy barber_cruz_avatars_read on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text or public.is_admin()));

    drop policy if exists barber_cruz_avatars_insert on storage.objects;
    create policy barber_cruz_avatars_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'avatars' and public.can_store_avatar() and name ~ (
          '^' || auth.uid()::text ||
          '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
        )
      );

    drop policy if exists barber_cruz_avatars_delete on storage.objects;
    create policy barber_cruz_avatars_delete on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (
        split_part(name, '/', 1) = auth.uid()::text or (
          public.is_admin() and exists (
            select 1 from public.profiles p
            where p.id::text = split_part(storage.objects.name, '/', 1) and p.role = 'customer'
          )
        )
      ));
  else
    raise notice 'Supabase Storage is absent: avatar bucket setup skipped in this PostgreSQL installation.';
  end if;
end;
$$;

-- PostgreSQL gives PUBLIC function execution by default: revoke it explicitly.
revoke all on function public.is_admin() from public;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.validate_profile_avatar() from public, anon, authenticated;
revoke all on function public.validate_profile_deletion() from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.can_store_avatar() from public, anon, authenticated;
revoke all on function public.validate_settings() from public, anon, authenticated;
revoke all on function public.validate_appointment() from public, anon, authenticated;
revoke all on function public.validate_block() from public, anon, authenticated;
revoke all on function public.book_appointment(text, date, text, boolean, text) from public, anon, authenticated;
revoke all on function public.booked_intervals(date) from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_store_avatar() to authenticated;
grant execute on function public.book_appointment(text, date, text, boolean, text) to authenticated;
grant execute on function public.booked_intervals(date) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.prepare_account_deletion(uuid, uuid) to service_role;
    grant execute on function public.release_account_deletion(uuid) to service_role;
  end if;
end;
$$;

-- Supabase provides this publication. Leave plain PostgreSQL installations alone.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['profiles', 'services', 'settings', 'blocks', 'appointments'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

commit;
