-- Jitsi meeting rooms for live classes.
-- Every class gets its own random room id, and, unless an admin sets another link (admin_update_batch), a Jitsi
-- link built from that id. Students never read either column directly: my_sessions() and the dashboard hand out
-- the link only from 15 minutes before a class until it ends, judged by the database clock (unchanged).
alter table public.sessions add column if not exists room_id uuid not null default gen_random_uuid();

create function public.sessions_default_join_url() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.join_url is null then
    new.join_url := 'https://meet.jit.si/nuvora-' || new.room_id::text;
  end if;
  return new;
end $$;

create trigger sessions_default_join_url before insert on public.sessions
  for each row execute function public.sessions_default_join_url();

-- Classes that already exist get their link too.
update public.sessions set join_url = 'https://meet.jit.si/nuvora-' || room_id::text where join_url is null;

revoke all on function public.sessions_default_join_url() from public, anon, authenticated;
