do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'operation_proofs_type_preuve_check'
      and conrelid = 'public.operation_proofs'::regclass
  ) then
    alter table public.operation_proofs
      drop constraint operation_proofs_type_preuve_check;
  end if;

  alter table public.operation_proofs
    add constraint operation_proofs_type_preuve_check
    check (type_preuve in ('document', 'voice', 'signature', 'note'));
end $$;
