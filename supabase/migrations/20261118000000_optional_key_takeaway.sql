-- The key takeaway is optional: groups can submit without one.
-- Run this in the Supabase SQL editor (or supabase db push) after the first migration.

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
