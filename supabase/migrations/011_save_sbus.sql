-- Replace the SBU list through targeted changes rather than an unrestricted DELETE.
create or replace function public.save_sbus(p_names text) returns void
language plpgsql security definer set search_path='' as $$
declare units text[];
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_names is null or length(p_names)>12000 then raise exception 'Enter business units separated by commas.'; end if;
 select array_agg(distinct trim(v) order by trim(v)) into units from unnest(string_to_array(p_names,',')) v where trim(v)<>'';
 if coalesce(array_length(units,1),0)=0 then raise exception 'Enter at least one business unit.'; end if;
 if exists(select 1 from unnest(units) v where length(v)>120) then raise exception 'Each business unit must be 120 characters or fewer.'; end if;
 perform pg_advisory_xact_lock(731106);
 delete from public.sbus where not (name=any(units));
 insert into public.sbus(name) select unnest(units) on conflict do nothing;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'settings.sbus',jsonb_build_object('sbus',units));
end; $$;
revoke all on function public.save_sbus(text) from public;
grant execute on function public.save_sbus(text) to authenticated;
