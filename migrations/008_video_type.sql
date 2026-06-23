-- Allow items.type = 'video' (Phase A video support).
-- The original CHECK constraint (002) only permits ('photo','document'). It was created
-- inline, so its name is the Postgres default — but to be safe we look it up and drop
-- whatever check constraint references the type column, then re-add the widened one.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'items'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type%photo%';
  if c is not null then
    execute format('alter table items drop constraint %I', c);
  end if;
end $$;

alter table items
  add constraint items_type_check check (type in ('photo','document','video'));
