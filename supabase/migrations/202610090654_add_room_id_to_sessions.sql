-- Add room_id column to sessions table for Jitsi integration
alter table public.sessions add column if not exists room_id uuid not null default gen_random_uuid();

