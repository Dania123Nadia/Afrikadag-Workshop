-- =====================================================================
-- Afrikadag Workshop Platform — schema, security and workshop logic
-- =====================================================================
-- Security model
--   * Facilitators sign in with email + password and are listed in public.admins.
--   * Participants never create an account: the app signs them in with a
--     Supabase *anonymous* session (stored in the browser), then calls
--     join_workshop(code, table, name). That links the anonymous user id to a
--     participant row, a table and therefore a stakeholder group.
--   * Every table has RLS. Participants can only read their own workshop's
--     shared configuration and only their own group's workspace. Admins can
--     read and change everything.
--   * State-changing workshop logic runs in SECURITY DEFINER functions that
--     re-check who is calling.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create table public.workshops (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  subtitle                text,
  access_code             text not null unique check (access_code ~ '^[A-Z0-9]{4,10}$'),
  status                  text not null default 'draft'
                          check (status in ('draft','live','paused','ended')),
  current_stage           int  not null default 0,
  -- Timer: while running, timer_ends_at is authoritative. When stopped,
  -- timer_remaining holds the remaining seconds.
  timer_running           boolean not null default false,
  timer_ends_at           timestamptz,
  timer_remaining         int,
  submissions_locked      boolean not null default false,
  ask_names               boolean not null default true,
  max_participants        int not null default 80 check (max_participants between 1 and 500),
  spotlight_group_id      uuid,
  content                 jsonb not null default '{}'::jsonb,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.workshop_stages (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  position         int  not null,
  kind             text not null check (kind in ('intro','proposal','assignment','discussion','submit','presentation')),
  title            text not null,
  instructions     text not null default '',
  duration_minutes int  not null default 10 check (duration_minutes between 0 and 600),
  unique (workshop_id, position)
);

create table public.stakeholder_groups (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  position    int  not null default 0,
  name        text not null,
  icon        text not null default 'users',
  color       text not null default '#0b5cad',
  who         text not null default '',   -- who the stakeholder is + role
  interests   text not null default '',
  concerns    text not null default '',
  illustrative boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.workshops
  add constraint workshops_spotlight_fk foreign key (spotlight_group_id)
  references public.stakeholder_groups(id) on delete set null;

-- Which table belongs to which stakeholder group (many tables -> one group)
create table public.group_assignments (
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  table_number int  not null check (table_number between 1 and 999),
  group_id     uuid not null references public.stakeholder_groups(id) on delete cascade,
  primary key (workshop_id, table_number)
);

create table public.guiding_questions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.stakeholder_groups(id) on delete cascade,
  position   int  not null default 0,
  text       text not null,
  level      text not null default 'core' check (level in ('core','deeper','challenge'))
);

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) <= 60),
  table_number  int  not null,
  group_id      uuid not null references public.stakeholder_groups(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (workshop_id, user_id)
);

-- Shared free-text fields of a group workspace (notes, key takeaway).
-- `version` enables optimistic concurrency + client-side 3-way merging.
create table public.group_fields (
  group_id    uuid not null references public.stakeholder_groups(id) on delete cascade,
  field       text not null check (field in ('notes','key_takeaway')),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  content     text not null default '' check (char_length(content) <= 20000),
  version     int  not null default 0,
  updated_by  uuid references public.participants(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (group_id, field)
);

-- Opportunities / risks / recommendations: one row per idea, so several
-- people can add ideas at the same time without overwriting each other.
create table public.response_items (
  id            uuid primary key default gen_random_uuid(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  group_id      uuid not null references public.stakeholder_groups(id) on delete cascade,
  kind          text not null check (kind in ('opportunity','risk','recommendation')),
  text          text not null check (char_length(text) between 1 and 1000),
  author_id     uuid references public.participants(id) on delete set null,
  author_label  text,
  -- facilitator curation (never changes the participant's words)
  featured      boolean not null default false,
  flag          text check (flag in ('innovative','disagreement','insight')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Individual first reactions (one per participant), visible to their group
create table public.reflections (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  workshop_id    uuid not null references public.workshops(id) on delete cascade,
  group_id       uuid not null references public.stakeholder_groups(id) on delete cascade,
  author_label   text,
  text           text not null default '' check (char_length(text) <= 1000),
  updated_at     timestamptz not null default now()
);

-- Current status of each group's work (draft vs submitted)
create table public.group_progress (
  group_id          uuid primary key references public.stakeholder_groups(id) on delete cascade,
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  status            text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at      timestamptz,
  submitted_by      text,
  submission_count  int not null default 0,
  last_activity_at  timestamptz,
  edited_after_submit boolean not null default false
);

-- Immutable snapshots each time a group submits (the "submitted" version)
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  group_id     uuid not null references public.stakeholder_groups(id) on delete cascade,
  snapshot     jsonb not null,
  submitted_by text,
  submitted_at timestamptz not null default now()
);

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index on public.workshop_stages (workshop_id, position);
create index on public.stakeholder_groups (workshop_id, position);
create index on public.group_assignments (group_id);
create index on public.guiding_questions (group_id, position);
create index on public.participants (workshop_id, group_id);
create index on public.participants (user_id);
create index on public.group_fields (workshop_id);
create index on public.response_items (group_id, kind, created_at);
create index on public.response_items (workshop_id);
create index on public.reflections (group_id);
create index on public.submissions (group_id, submitted_at desc);
create index on public.announcements (workshop_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can be used inside policies
-- without recursive RLS evaluation)
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.my_workshop_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select workshop_id from public.participants where user_id = auth.uid();
$$;

create or replace function public.my_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select group_id from public.participants where user_id = auth.uid();
$$;

create or replace function public.my_participant(p_workshop uuid) returns public.participants
language sql stable security definer set search_path = public as $$
  select * from public.participants where user_id = auth.uid() and workshop_id = p_workshop;
$$;

-- Can the current user write to this group's workspace right now?
create or replace function public.can_write_group(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.participants p
    join public.workshops w on w.id = p.workshop_id
    where p.user_id = auth.uid()
      and p.group_id = p_group
      and w.submissions_locked = false
      and w.status in ('live','paused')
  );
$$;

create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now(); $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.admins             enable row level security;
alter table public.workshops          enable row level security;
alter table public.workshop_stages    enable row level security;
alter table public.stakeholder_groups enable row level security;
alter table public.group_assignments  enable row level security;
alter table public.guiding_questions  enable row level security;
alter table public.participants       enable row level security;
alter table public.group_fields       enable row level security;
alter table public.response_items     enable row level security;
alter table public.reflections        enable row level security;
alter table public.group_progress     enable row level security;
alter table public.submissions        enable row level security;
alter table public.announcements      enable row level security;

-- admins: you can see whether you yourself are an admin
create policy admins_self on public.admins for select using (user_id = auth.uid());

-- workshops
create policy workshops_read on public.workshops for select
  using (public.is_admin() or id in (select public.my_workshop_ids()));
create policy workshops_admin_write on public.workshops for all
  using (public.is_admin()) with check (public.is_admin());

-- shared configuration: visible to everyone in the workshop, editable by admins
create policy stages_read on public.workshop_stages for select
  using (public.is_admin() or workshop_id in (select public.my_workshop_ids()));
create policy stages_admin on public.workshop_stages for all
  using (public.is_admin()) with check (public.is_admin());

create policy groups_read on public.stakeholder_groups for select
  using (public.is_admin() or workshop_id in (select public.my_workshop_ids()));
create policy groups_admin on public.stakeholder_groups for all
  using (public.is_admin()) with check (public.is_admin());

create policy assignments_admin on public.group_assignments for all
  using (public.is_admin()) with check (public.is_admin());

-- guiding questions: only your own group's questions
create policy questions_read on public.guiding_questions for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy questions_admin on public.guiding_questions for all
  using (public.is_admin()) with check (public.is_admin());

-- participants: only your own row (no lists of other people's names)
create policy participants_read on public.participants for select
  using (public.is_admin() or user_id = auth.uid());
create policy participants_admin on public.participants for all
  using (public.is_admin()) with check (public.is_admin());

-- group workspace: own group only; writes go through RPCs or checked policies
create policy fields_read on public.group_fields for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy fields_admin on public.group_fields for all
  using (public.is_admin()) with check (public.is_admin());

create policy items_read on public.response_items for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy items_insert on public.response_items for insert
  with check (public.can_write_group(group_id)
              and author_id = (select id from public.participants
                               where user_id = auth.uid() and group_id = response_items.group_id limit 1)
              and featured = false and flag is null);
-- group members may edit/delete any idea of their own group (it is a shared board)
create policy items_update on public.response_items for update
  using (public.can_write_group(group_id)) with check (public.can_write_group(group_id));
create policy items_delete on public.response_items for delete
  using (public.can_write_group(group_id));
create policy items_admin on public.response_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy reflections_read on public.reflections for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy reflections_admin on public.reflections for all
  using (public.is_admin()) with check (public.is_admin());

create policy progress_read on public.group_progress for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy progress_admin on public.group_progress for all
  using (public.is_admin()) with check (public.is_admin());

create policy submissions_read on public.submissions for select
  using (public.is_admin() or group_id in (select public.my_group_ids()));
create policy submissions_admin on public.submissions for all
  using (public.is_admin()) with check (public.is_admin());

create policy announcements_read on public.announcements for select
  using (public.is_admin() or workshop_id in (select public.my_workshop_ids()));
create policy announcements_admin on public.announcements for all
  using (public.is_admin()) with check (public.is_admin());

-- Participants must not be able to curate (feature/flag) items: column guard
create or replace function public.guard_item_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.featured is distinct from old.featured or new.flag is distinct from old.flag
       or new.group_id is distinct from old.group_id or new.workshop_id is distinct from old.workshop_id
       or new.author_id is distinct from old.author_id or new.kind is distinct from old.kind then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger response_items_guard before update on public.response_items
  for each row execute function public.guard_item_update();

-- Fill author label + workshop id for new items, and mark group activity
create or replace function public.prepare_item_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.participants;
begin
  select * into p from public.participants where id = new.author_id;
  if found then
    new.author_label := coalesce(nullif(p.display_name,''), 'Table ' || p.table_number);
    new.workshop_id  := p.workshop_id;
  end if;
  return new;
end $$;
create trigger response_items_prepare before insert on public.response_items
  for each row execute function public.prepare_item_insert();

create or replace function public.touch_group_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  g := coalesce(new.group_id, old.group_id);
  update public.group_progress
     set last_activity_at = now(),
         edited_after_submit = (status = 'submitted')
   where group_id = g;
  return null;
end $$;
create trigger response_items_activity after insert or delete on public.response_items
  for each row execute function public.touch_group_activity();
-- only count content edits (not facilitator curation) as group activity
create trigger response_items_activity_upd after update of text on public.response_items
  for each row execute function public.touch_group_activity();
create trigger group_fields_activity after insert or update on public.group_fields
  for each row execute function public.touch_group_activity();

-- ---------------------------------------------------------------------
-- Participant RPCs
-- ---------------------------------------------------------------------

-- Look up a workshop by its code before joining (title + whether names are asked)
create or replace function public.workshop_lookup(p_code text)
returns table (title text, subtitle text, ask_names boolean, status text, tables int[])
language sql stable security definer set search_path = public as $$
  select w.title, w.subtitle, w.ask_names, w.status,
         coalesce((select array_agg(a.table_number order by a.table_number)
                   from public.group_assignments a where a.workshop_id = w.id), '{}')
  from public.workshops w where w.access_code = upper(trim(p_code));
$$;

create or replace function public.join_workshop(p_code text, p_table int, p_name text default null)
returns public.participants
language plpgsql security definer set search_path = public as $$
declare
  w public.workshops;
  g uuid;
  p public.participants;
  n int;
  clean_name text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into w from public.workshops where access_code = upper(trim(p_code));
  if not found then raise exception 'WORKSHOP_NOT_FOUND'; end if;
  if w.status = 'ended' then raise exception 'WORKSHOP_ENDED'; end if;

  select group_id into g from public.group_assignments
   where workshop_id = w.id and table_number = p_table;
  if g is null then raise exception 'TABLE_NOT_FOUND'; end if;

  clean_name := case when w.ask_names then nullif(left(trim(coalesce(p_name,'')), 60), '') else null end;

  select * into p from public.participants where workshop_id = w.id and user_id = auth.uid();
  if found then
    update public.participants
       set table_number = p_table, group_id = g,
           display_name = coalesce(clean_name, display_name),
           last_seen_at = now()
     where id = p.id returning * into p;
    update public.reflections set group_id = g where participant_id = p.id;
    return p;
  end if;

  select count(*) into n from public.participants where workshop_id = w.id;
  if n >= w.max_participants then raise exception 'WORKSHOP_FULL'; end if;

  insert into public.participants (workshop_id, user_id, display_name, table_number, group_id)
  values (w.id, auth.uid(), clean_name, p_table, g)
  returning * into p;
  return p;
end $$;

create or replace function public.touch_participant(p_workshop uuid) returns void
language sql security definer set search_path = public as $$
  update public.participants set last_seen_at = now()
   where user_id = auth.uid() and workshop_id = p_workshop;
$$;

-- Save a shared text field with optimistic concurrency.
-- If p_base_version is stale the save is rejected and the latest content is
-- returned so the client can merge its edits and try again.
create or replace function public.save_group_field(
  p_group uuid, p_field text, p_content text, p_base_version int)
returns table (ok boolean, version int, content text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  me public.participants;
  cur public.group_fields;
begin
  select * into me from public.participants where user_id = auth.uid() and group_id = p_group limit 1;
  if not found and not public.is_admin() then raise exception 'NOT_IN_GROUP'; end if;
  if not public.is_admin() and not public.can_write_group(p_group) then raise exception 'LOCKED'; end if;

  select * into cur from public.group_fields f where f.group_id = p_group and f.field = p_field for update;
  if not found then
    insert into public.group_fields (group_id, field, workshop_id, content, version, updated_by)
    select p_group, p_field, sg.workshop_id, '', 0, null from public.stakeholder_groups sg where sg.id = p_group
    returning * into cur;
  end if;

  if cur.version <> p_base_version then
    return query select false, cur.version, cur.content, cur.updated_at;
    return;
  end if;

  update public.group_fields f
     set content = p_content, version = f.version + 1, updated_by = me.id, updated_at = now()
   where f.group_id = p_group and f.field = p_field
   returning * into cur;
  return query select true, cur.version, cur.content, cur.updated_at;
end $$;

create or replace function public.save_reflection(p_workshop uuid, p_text text) returns public.reflections
language plpgsql security definer set search_path = public as $$
declare me public.participants; r public.reflections;
begin
  select * into me from public.participants where user_id = auth.uid() and workshop_id = p_workshop;
  if not found then raise exception 'NOT_JOINED'; end if;
  if not public.can_write_group(me.group_id) then raise exception 'LOCKED'; end if;
  insert into public.reflections (participant_id, workshop_id, group_id, author_label, text, updated_at)
  values (me.id, me.workshop_id, me.group_id,
          coalesce(nullif(me.display_name,''), 'Table ' || me.table_number), left(p_text, 1000), now())
  on conflict (participant_id) do update
     set text = excluded.text, updated_at = now(), group_id = excluded.group_id, author_label = excluded.author_label
  returning * into r;
  return r;
end $$;

-- Finalise (or re-submit) the group's contribution: stores an immutable snapshot
create or replace function public.submit_group(p_group uuid) returns public.group_progress
language plpgsql security definer set search_path = public as $$
declare
  me public.participants;
  takeaway text;
  snap jsonb;
  gp public.group_progress;
  label text;
begin
  select * into me from public.participants where user_id = auth.uid() and group_id = p_group limit 1;
  if not found then raise exception 'NOT_IN_GROUP'; end if;
  if not public.can_write_group(p_group) then raise exception 'LOCKED'; end if;

  select content into takeaway from public.group_fields where group_id = p_group and field = 'key_takeaway';
  if coalesce(trim(takeaway), '') = '' then raise exception 'KEY_TAKEAWAY_REQUIRED'; end if;

  label := coalesce(nullif(me.display_name,''), 'Table ' || me.table_number);

  select jsonb_build_object(
    'key_takeaway', takeaway,
    'notes', (select content from public.group_fields where group_id = p_group and field = 'notes'),
    'opportunities',   coalesce((select jsonb_agg(text order by created_at) from public.response_items where group_id = p_group and kind = 'opportunity'), '[]'),
    'risks',           coalesce((select jsonb_agg(text order by created_at) from public.response_items where group_id = p_group and kind = 'risk'), '[]'),
    'recommendations', coalesce((select jsonb_agg(text order by created_at) from public.response_items where group_id = p_group and kind = 'recommendation'), '[]'),
    'reflections',     coalesce((select jsonb_agg(jsonb_build_object('by', author_label, 'text', text)) from public.reflections where group_id = p_group and trim(text) <> ''), '[]')
  ) into snap;

  insert into public.submissions (workshop_id, group_id, snapshot, submitted_by)
  values (me.workshop_id, p_group, snap, label);

  update public.group_progress
     set status = 'submitted', submitted_at = now(), submitted_by = label,
         submission_count = submission_count + 1, edited_after_submit = false
   where group_id = p_group
   returning * into gp;
  return gp;
end $$;

-- ---------------------------------------------------------------------
-- Facilitator RPCs
-- ---------------------------------------------------------------------

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
end $$;

-- One entry point for all live workshop controls
create or replace function public.admin_control(p_workshop uuid, p_action text, p_value int default null)
returns public.workshops
language plpgsql security definer set search_path = public as $$
declare
  w public.workshops;
  n_stages int;
  target int;
  dur int;
  remaining int;
begin
  perform public.require_admin();
  select * into w from public.workshops where id = p_workshop for update;
  if not found then raise exception 'WORKSHOP_NOT_FOUND'; end if;
  select count(*) into n_stages from public.workshop_stages where workshop_id = p_workshop;

  remaining := case when w.timer_running then greatest(0, ceil(extract(epoch from (w.timer_ends_at - now())))::int)
                    else w.timer_remaining end;

  if p_action in ('start','next','prev','goto') then
    target := case p_action
      when 'start' then coalesce(p_value, w.current_stage)
      when 'next'  then least(w.current_stage + 1, n_stages - 1)
      when 'prev'  then greatest(w.current_stage - 1, 0)
      else p_value end;
    if target is null or target < 0 or target >= n_stages then raise exception 'BAD_STAGE'; end if;
    select duration_minutes * 60 into dur from public.workshop_stages where workshop_id = p_workshop and position = target;
    update public.workshops set
      current_stage = target,
      status = case when status in ('draft','ended') or p_action = 'start' then 'live' else status end,
      timer_running = (dur > 0 and (p_action = 'start' or status <> 'paused')),
      timer_ends_at = case when dur > 0 then now() + make_interval(secs => dur) else null end,
      timer_remaining = dur,
      updated_at = now()
    where id = p_workshop returning * into w;

  elsif p_action = 'pause' then
    update public.workshops set status = 'paused', timer_running = false, timer_remaining = remaining,
           timer_ends_at = null, updated_at = now()
     where id = p_workshop returning * into w;

  elsif p_action = 'resume' then
    update public.workshops set status = 'live',
           timer_running = coalesce(remaining, 0) > 0,
           timer_ends_at = case when coalesce(remaining,0) > 0 then now() + make_interval(secs => remaining) else null end,
           updated_at = now()
     where id = p_workshop returning * into w;

  elsif p_action = 'timer_start' then
    update public.workshops set timer_running = true,
           timer_ends_at = now() + make_interval(secs => coalesce(p_value, remaining, 0)),
           timer_remaining = coalesce(p_value, remaining, 0), updated_at = now()
     where id = p_workshop returning * into w;

  elsif p_action = 'timer_stop' then
    update public.workshops set timer_running = false, timer_remaining = remaining, timer_ends_at = null, updated_at = now()
     where id = p_workshop returning * into w;

  elsif p_action = 'timer_set' then  -- set remaining seconds without starting
    update public.workshops set timer_running = false, timer_remaining = greatest(0, coalesce(p_value,0)),
           timer_ends_at = null, updated_at = now()
     where id = p_workshop returning * into w;

  elsif p_action = 'extend' then      -- p_value = seconds to add (may be negative)
    update public.workshops set
           timer_ends_at = case when timer_running then timer_ends_at + make_interval(secs => p_value) else null end,
           timer_remaining = greatest(0, coalesce(remaining,0) + p_value),
           updated_at = now()
     where id = p_workshop returning * into w;
    -- keep the stage's planned duration in sync so the plan reflects reality
    update public.workshop_stages set duration_minutes = greatest(0, duration_minutes + round(p_value/60.0)::int)
     where workshop_id = p_workshop and position = w.current_stage;

  elsif p_action = 'lock' then
    update public.workshops set submissions_locked = true, updated_at = now() where id = p_workshop returning * into w;
  elsif p_action = 'unlock' then
    update public.workshops set submissions_locked = false, updated_at = now() where id = p_workshop returning * into w;
  elsif p_action = 'end' then
    update public.workshops set status = 'ended', timer_running = false, timer_ends_at = null, timer_remaining = 0,
           updated_at = now() where id = p_workshop returning * into w;
  elsif p_action = 'reset' then  -- back to draft, keeps data
    update public.workshops set status = 'draft', current_stage = 0, timer_running = false, timer_ends_at = null,
           timer_remaining = null, updated_at = now() where id = p_workshop returning * into w;
  else
    raise exception 'UNKNOWN_ACTION %', p_action;
  end if;
  return w;
end $$;

create or replace function public.admin_set_spotlight(p_workshop uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update public.workshops set spotlight_group_id = p_group, updated_at = now() where id = p_workshop;
end $$;

-- Ensure each group has its workspace rows (fields + progress)
create or replace function public.ensure_group_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_fields (group_id, field, workshop_id) values
    (new.id, 'notes', new.workshop_id), (new.id, 'key_takeaway', new.workshop_id)
  on conflict do nothing;
  insert into public.group_progress (group_id, workshop_id) values (new.id, new.workshop_id)
  on conflict do nothing;
  return new;
end $$;
create trigger stakeholder_groups_rows after insert on public.stakeholder_groups
  for each row execute function public.ensure_group_rows();

-- When a facilitator moves a table to another stakeholder group, move its participants too
create or replace function public.sync_table_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is distinct from old.group_id then
    update public.participants set group_id = new.group_id
     where workshop_id = new.workshop_id and table_number = new.table_number;
    update public.reflections r set group_id = new.group_id
      from public.participants p
     where p.id = r.participant_id and p.workshop_id = new.workshop_id and p.table_number = new.table_number;
  end if;
  return new;
end $$;
create trigger group_assignments_sync after update on public.group_assignments
  for each row execute function public.sync_table_group();

-- Privacy: wipe everything participants produced (keeps the workshop setup)
create or replace function public.admin_purge_participant_data(p_workshop uuid) returns int
language plpgsql security definer set search_path = public, auth as $$
declare uids uuid[]; n int;
begin
  perform public.require_admin();
  select array_agg(user_id) into uids from public.participants where workshop_id = p_workshop;
  delete from public.submissions    where workshop_id = p_workshop;
  delete from public.response_items where workshop_id = p_workshop;
  delete from public.reflections    where workshop_id = p_workshop;
  delete from public.announcements  where workshop_id = p_workshop;
  update public.group_fields set content = '', version = version + 1, updated_by = null, updated_at = now()
   where workshop_id = p_workshop;
  update public.group_progress set status = 'draft', submitted_at = null, submitted_by = null,
         submission_count = 0, last_activity_at = null, edited_after_submit = false
   where workshop_id = p_workshop;
  delete from public.participants where workshop_id = p_workshop;
  get diagnostics n = row_count;
  -- remove the anonymous auth users that only existed for this workshop
  if uids is not null then
    delete from auth.users u
     where u.id = any(uids) and u.is_anonymous
       and not exists (select 1 from public.participants p where p.user_id = u.id);
  end if;
  return n;
end $$;

create or replace function public.admin_delete_workshop(p_workshop uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  perform public.admin_purge_participant_data(p_workshop);
  delete from public.workshops where id = p_workshop;
end $$;

-- Make a user an admin (run from the SQL editor, or via the create-admin script)
create or replace function public.grant_admin(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.admins (user_id, email)
  select id, email from auth.users where lower(email) = lower(p_email)
  on conflict (user_id) do nothing;
  if not found then raise notice 'No user with that e-mail (or already admin)'; end if;
end $$;
revoke execute on function public.grant_admin(text) from public, anon, authenticated;

-- Create a workshop pre-filled with the Afrikadag template
create or replace function public.admin_create_workshop(p_title text, p_code text, p_tables int default 10)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  wid uuid;
  gid uuid;
  g_ids uuid[] := '{}';
  i int;
  rec record;
begin
  perform public.require_admin();
  insert into public.workshops (title, subtitle, access_code, created_by, content)
  values (p_title, 'Labour migration between Kenya and the Netherlands',
          upper(trim(p_code)), auth.uid(), '{}'::jsonb)
  returning id into wid;

  insert into public.workshop_stages (workshop_id, position, kind, title, instructions, duration_minutes) values
  (wid, 0, 'intro', 'Introduction',
   'Welcome! Follow along on your screen while the facilitator introduces the challenge.', 10),
  (wid, 1, 'proposal', 'Understanding the proposal',
   'Look at the three parts of the proposal. Tap each one to learn more. You do not need to write anything yet.', 10),
  (wid, 2, 'assignment', 'Stakeholder assignment',
   'Your table represents one stakeholder. Read your role card and discuss it briefly with your table.', 5),
  (wid, 3, 'discussion', 'Group discussion',
   'Discuss the proposal from your stakeholder''s point of view. Use the guiding questions and add your ideas below. Everything saves automatically.', 20),
  (wid, 4, 'submit', 'Submit your insights',
   'Agree on the single most important insight for the room, check your ideas, then submit as a group.', 5),
  (wid, 5, 'presentation', 'Presentations and reflection',
   'Each group shares its key insight in one minute. Listen for points where perspectives differ.', 15);

  for rec in select * from (values
    (0, 'Dutch Government', 'landmark', '#1d4ed8',
     'National ministries and agencies responsible for labour migration, integration and labour market policy in the Netherlands. They set the legal framework for work permits and can negotiate agreements with partner countries.',
     'Filling persistent labour shortages in key sectors; maintaining public and political support for migration policy; ensuring orderly, legal and well-regulated migration.',
     'Political sensitivity around immigration numbers; risk that temporary stays become permanent without planning; enforcement of fair working conditions; administrative cost and complexity.'),
    (1, 'Kenyan Government', 'flag', '#047857',
     'National and county authorities responsible for employment, education and diaspora affairs in Kenya. They can shape which sectors are open to international recruitment and support returning workers.',
     'Employment opportunities for a young and growing workforce; remittances and skills that return to the Kenyan economy; protection of citizens working abroad.',
     'Losing skilled workers in sectors Kenya itself needs (brain drain); unequal bargaining power in bilateral agreements; reintegration of returning workers; who controls recruitment.'),
    (2, 'Employers / Private Sector', 'briefcase', '#b45309',
     'Companies and sector associations in the Netherlands facing vacancies they struggle to fill, together with recruitment agencies. They would hire, train and employ workers under the model.',
     'Reliable access to qualified workers; predictable and fast procedures; skills that match the job from day one; retaining good employees.',
     'Costs of training, travel, housing and language education; losing trained staff when a period ends; bureaucracy; reputational risk if working conditions are poor in the supply chain.'),
    (3, 'Migrants / Prospective Migrants', 'user-round', '#7c3aed',
     'Kenyan workers who are considering or currently undertaking work in the Netherlands, and their families. They carry most of the personal risk and benefit of the model.',
     'Decent wages and working conditions; recognised skills and training; a safe, transparent route without debt to recruiters; prospects for the future, including possibly staying longer.',
     'Uncertainty about whether they can return or stay; dependency on one employer; housing and fair treatment; family separation; recognition of skills when returning home.'),
    (4, 'Educational Institutions / NGOs', 'graduation-cap', '#be185d',
     'Vocational schools, training centres, universities and civil-society organisations in Kenya and the Netherlands. They could design assessments, deliver training and language education and support workers.',
     'High-quality training that benefits both countries; fair access for candidates; long-term partnerships and funding; protecting workers'' rights and wellbeing.',
     'Training that only serves foreign employers; unclear standards and who sets them; sustainability of funding; their independence when cooperating with governments and companies.')
  ) as t(pos, name, icon, color, who, interests, concerns)
  loop
    insert into public.stakeholder_groups (workshop_id, position, name, icon, color, who, interests, concerns)
    values (wid, rec.pos, rec.name, rec.icon, rec.color, rec.who, rec.interests, rec.concerns)
    returning id into gid;
    g_ids := g_ids || gid;
  end loop;

  -- Guiding questions (illustrative and editable)
  insert into public.guiding_questions (group_id, position, text, level) values
  (g_ids[1], 0, 'Does this model sufficiently balance political concerns about immigration with Dutch labour shortages?', 'core'),
  (g_ids[1], 1, 'How can circular migration be implemented without creating exploitation or precarious employment?', 'deeper'),
  (g_ids[1], 2, 'Under what circumstances should the Netherlands allow opportunities for permanent migration?', 'challenge'),
  (g_ids[2], 0, 'How can Kenya benefit economically from this model?', 'core'),
  (g_ids[2], 1, 'How do we prevent brain drain in sectors where Kenya also needs skilled workers?', 'deeper'),
  (g_ids[2], 2, 'Should Kenya have the authority to restrict recruitment in certain sectors?', 'challenge'),
  (g_ids[3], 0, 'Would standardised skills assessments improve recruitment?', 'core'),
  (g_ids[3], 1, 'Who should bear the costs of training?', 'deeper'),
  (g_ids[3], 2, 'How can employers ensure fair working conditions?', 'challenge'),
  (g_ids[4], 0, 'Does circular migration offer genuine opportunities or create uncertainty?', 'core'),
  (g_ids[4], 1, 'What safeguards should exist regarding wages, housing and workers'' rights?', 'deeper'),
  (g_ids[4], 2, 'Should participants be able to transition to permanent residence?', 'challenge'),
  (g_ids[5], 0, 'How should training standards be developed?', 'core'),
  (g_ids[5], 1, 'Who should determine which skills are needed?', 'deeper'),
  (g_ids[5], 2, 'How can local educational institutions benefit from the partnership?', 'challenge');

  -- Default seating: tables are spread evenly across the groups (1→A, 2→B …)
  for i in 1..greatest(p_tables, 1) loop
    insert into public.group_assignments (workshop_id, table_number, group_id)
    values (wid, i, g_ids[((i - 1) % array_length(g_ids, 1)) + 1]);
  end loop;

  return wid;
end $$;

-- ---------------------------------------------------------------------
-- Grants (RLS still applies)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.workshop_lookup(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime: stream changes of these tables (RLS-filtered per subscriber)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.workshops, public.workshop_stages, public.stakeholder_groups, public.guiding_questions,
  public.participants, public.group_fields, public.response_items, public.reflections,
  public.group_progress, public.submissions, public.announcements, public.group_assignments;
