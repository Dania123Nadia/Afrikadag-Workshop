-- Named tables for the join screen
-- Participants pick "Dutch Government 1", "Dutch Government 2", "Kenyan Government 1" …
-- instead of a bare table number. This returns each table with its stakeholder
-- name and its number within that stakeholder. It only exposes what the join
-- screen needs (no profiles, no participants) and works before signing in.
--
-- Run this once in the Supabase SQL editor (safe to run again).

create or replace function public.workshop_tables(p_code text)
returns table (table_number int, group_name text, group_color text, group_icon text, group_position int, nth int)
language sql stable security definer set search_path = public as $$
  select a.table_number, g.name, g.color, g.icon, g.position,
         (row_number() over (partition by g.id order by a.table_number))::int
    from public.workshops w
    join public.group_assignments a on a.workshop_id = w.id
    join public.stakeholder_groups g on g.id = a.group_id
   where w.access_code = upper(trim(p_code))
   order by g.position, g.name, a.table_number;
$$;
grant execute on function public.workshop_tables(text) to anon, authenticated;
