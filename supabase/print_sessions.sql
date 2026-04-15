create table if not exists public.print_sessions (
  id uuid primary key,
  created_at timestamptz not null,
  duration_ms integer not null,
  signal_count integer not null,
  total_distance double precision not null default 0,
  scroll_depth_cm double precision not null,
  accumulated_distance_cm double precision not null,
  scroll_touch_count integer not null default 0,
  success boolean not null default true,
  error_message text
);

create index if not exists print_sessions_created_at_idx on public.print_sessions (created_at desc);

alter table public.print_sessions enable row level security;
