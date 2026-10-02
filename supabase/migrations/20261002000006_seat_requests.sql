-- Seat requests from the public website ("Request a seat").
-- The website calls request_seat() with the public (anon) key. Every rule is checked here, not only in the
-- browser. Requests are stored in seat_requests, which nobody can read through the API except admins via
-- admin_seat_requests(); every admin is notified of each new request the moment it arrives.
--
-- Rules:
--   * The program must exist and be active. The start must be a first Monday whose applications are still
--     open (apply by = start - 7 days, inclusive, as in next_start_date) and at most 200 days ahead, judged
--     by today's date in Asia/Kolkata.
--   * Consent to be contacted is required and its wording version is stored with the request.
--   * The same email, program and start within 30 days returns the earlier reference (duplicate = true)
--     and stores nothing new. At most 5 new requests per email in 24 hours.
--   * Errors use SQLSTATE 22023 and a message the website can show as is.

create table public.seat_requests (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique check (reference ~ '^NV-[2-9A-HJKMNP-Z]{6}$'),
  program_id      text not null references public.programs(id),
  start_date      date not null,
  full_name       text not null check (char_length(full_name) between 2 and 80),
  email           text not null check (char_length(email) <= 254 and email = lower(email)),
  phone           text check (phone ~ '^[0-9 +()-]{6,24}$'),
  country         text not null check (char_length(country) between 2 and 56),
  details         jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  source          text check (char_length(source) <= 200),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consented_at    timestamptz not null default now(),
  status          text not null default 'new' check (status in ('new','contacted','converted','closed')),
  notes           text check (char_length(notes) <= 2000),
  handled_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index seat_requests_email on public.seat_requests (email, created_at);
create index seat_requests_status on public.seat_requests (status, created_at);

alter table public.seat_requests enable row level security;
revoke all on public.seat_requests from anon, authenticated;    -- no policies: only the functions below
grant all on public.seat_requests to service_role;

-- ============================================================================
-- Helpers (internal)
-- ============================================================================
-- Why a start date cannot be requested on p_today (a calendar day in Asia/Kolkata), or null if it can.
create function public.seat_start_problem(p_start date, p_today date) returns text
language sql immutable as $$
  select case
    when p_start is null then 'Please choose a start date.'
    when p_start <> public.first_monday(p_start) then 'Please choose one of the listed start dates (batches start on the first Monday of each month).'
    when p_start - 7 < p_today then 'Applications for that start date have closed. Please choose a later start date.'
    when p_start > p_today + 200 then 'That start date is too far ahead. Please choose one within the next six months.'
  end
$$;

-- A reference people can read out on the phone: NV- and six characters without 0/O, 1/I/L.
create function public.seat_reference() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  r text := 'NV-';
begin
  for i in 0..5 loop
    r := r || substr(alphabet, get_byte(b, i) % 31 + 1, 1);
  end loop;
  return r;
end $$;

-- ============================================================================
-- The website's form
-- ============================================================================
create function public.request_seat(
  p_program         text,
  p_start           date,
  p_full_name       text,
  p_email           text,
  p_country         text,
  p_consent         boolean,
  p_consent_version text,
  p_phone           text default null,
  p_details         jsonb default '{}'::jsonb,
  p_source          text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today     date := (now() at time zone 'Asia/Kolkata')::date;
  prog      public.programs;
  problem   text;
  v_name    text;
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_country text := regexp_replace(trim(coalesce(p_country, '')), '\s+', ' ', 'g');
  v_phone   text := nullif(trim(coalesce(p_phone, '')), '');
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_source  text := nullif(trim(coalesce(p_source, '')), '');
  v_version text := trim(coalesce(p_consent_version, ''));
  prev      public.seat_requests;
  ref       text;
  tries     int := 0;
begin
  select * into prog from public.programs where id = p_program and active;
  if not found then raise exception 'Please choose one of our programs.' using errcode = '22023'; end if;

  problem := public.seat_start_problem(p_start, today);
  if problem is not null then raise exception '%', problem using errcode = '22023'; end if;

  if coalesce(p_full_name, '') ~ '[[:cntrl:]]' then
    raise exception 'Please enter your full name (2 to 80 characters).' using errcode = '22023';
  end if;
  v_name := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Please enter your full name (2 to 80 characters).' using errcode = '22023';
  end if;

  if char_length(v_email) > 254 or char_length(split_part(v_email, '@', 1)) > 64
     or v_email !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
    raise exception 'Please enter a valid email address.' using errcode = '22023';
  end if;

  if coalesce(p_country, '') ~ '[[:cntrl:]]' or char_length(v_country) not between 2 and 56 then
    raise exception 'Please enter your country.' using errcode = '22023';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9 +()-]{6,24}$' then
    raise exception 'Please enter a phone number of 6 to 24 digits, spaces and + - ( ), or leave it empty.' using errcode = '22023';
  end if;

  if p_consent is not true then
    raise exception 'Please agree to be contacted about your seat request.' using errcode = '22023';
  end if;
  if v_version = '' or char_length(v_version) > 40 or v_version ~ '[[:cntrl:]]' then
    raise exception 'This form is out of date. Please reload the page and try again.' using errcode = '22023';
  end if;

  -- Optional answers from the website's program finder: known keys only, each a short scalar.
  if jsonb_typeof(v_details) <> 'object'
     or char_length(v_details::text) > 1000
     or exists (select 1 from jsonb_each(v_details) d
                where d.key not in ('role','goal','hours','coding','has_bachelor','match','score')
                   or jsonb_typeof(d.value) not in ('string','number','boolean','null')
                   or char_length(d.value #>> '{}') > 200) then
    raise exception 'Some of your answers could not be saved. Please reload the page and try again.' using errcode = '22023';
  end if;
  if char_length(v_source) > 200 then
    raise exception 'This form is out of date. Please reload the page and try again.' using errcode = '22023';
  end if;

  -- One request at a time per email, so the duplicate check and the daily limit are exact.
  perform pg_advisory_xact_lock(hashtext('seat_request:' || v_email));

  select * into prev from public.seat_requests
   where email = v_email and program_id = prog.id and start_date = p_start and created_at > now() - interval '30 days'
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('reference', prev.reference, 'program', prog.id, 'program_name', prog.name,
                              'start_date', p_start, 'apply_by', p_start - 7, 'duplicate', true);
  end if;

  if (select count(*) from public.seat_requests where email = v_email and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'We already have several requests from this email today. Please try again tomorrow, or reply to our email.' using errcode = '22023';
  end if;

  loop
    ref := public.seat_reference();
    begin
      insert into public.seat_requests (reference, program_id, start_date, full_name, email, phone, country, details, source, consent_version)
      values (ref, prog.id, p_start, v_name, v_email, v_phone, v_country, v_details, v_source, v_version);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries >= 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object('reference', ref, 'program', prog.id, 'program_name', prog.name,
                            'start_date', p_start, 'apply_by', p_start - 7, 'duplicate', false);
end $$;

-- Every admin hears about a new request straight away (one notification per admin and request).
create function public.seat_request_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notifications (user_id, kind, ref_id, title, body)
  select p.id, 'seat_request', new.id,
         'New seat request: ' || (select name from public.programs where id = new.program_id),
         new.full_name || ' (' || new.country || ') asked for the ' || to_char(new.start_date, 'FMMon FMDD, YYYY')
           || ' start. Reference ' || new.reference || '.'
  from public.profiles p
  where p.role = 'admin'
  on conflict (user_id, kind, ref_id) do nothing;
  return new;
end $$;

create trigger seat_request_created after insert on public.seat_requests
  for each row execute function public.seat_request_notify();

-- ============================================================================
-- Admin tools
-- ============================================================================
create function public.seat_request_json(r public.seat_requests) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'program', r.program_id,
    'program_name', (select name from public.programs where id = r.program_id),
    'start_date', r.start_date, 'apply_by', r.start_date - 7,
    'full_name', r.full_name, 'email', r.email, 'phone', r.phone, 'country', r.country,
    'details', r.details, 'source', r.source, 'consent_version', r.consent_version, 'consented_at', r.consented_at,
    'status', r.status, 'notes', r.notes,
    'handled_by', (select coalesce(nullif(full_name, ''), email) from public.profiles where id = r.handled_by),
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

-- Newest first, optionally one status only (at most 500).
create function public.admin_seat_requests(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  if p_status is not null and p_status not in ('new','contacted','converted','closed') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(public.seat_request_json(r) order by r.created_at desc, r.id)
    from (select * from public.seat_requests
          where p_status is null or status = p_status
          order by created_at desc, id limit 500) r), '[]'::jsonb);
end $$;

-- Record follow-up: new -> contacted -> converted or closed, with notes (null keeps the current notes).
create function public.admin_update_seat_request(p_id uuid, p_status text, p_notes text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.seat_requests;
begin
  perform public.require_admin();
  if p_status is null or p_status not in ('new','contacted','converted','closed') then
    raise exception 'Invalid status %', p_status using errcode = '22023';
  end if;
  if char_length(p_notes) > 2000 then
    raise exception 'Notes are limited to 2000 characters' using errcode = '22001';
  end if;
  update public.seat_requests
     set status = p_status, notes = coalesce(p_notes, notes), handled_by = auth.uid(), updated_at = now()
   where id = p_id
  returning * into r;
  if not found then raise exception 'Unknown seat request' using errcode = 'P0002'; end if;
  return public.seat_request_json(r);
end $$;

-- ============================================================================
-- Who may call what: the form is public; everything else is internal or admin-only.
-- ============================================================================
revoke execute on function
  public.seat_start_problem(date, date),
  public.seat_reference(),
  public.request_seat(text, date, text, text, text, boolean, text, text, jsonb, text),
  public.seat_request_notify(),
  public.seat_request_json(public.seat_requests),
  public.admin_seat_requests(text),
  public.admin_update_seat_request(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.request_seat(text, date, text, text, text, boolean, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.admin_seat_requests(text), public.admin_update_seat_request(uuid, text, text) to authenticated;
