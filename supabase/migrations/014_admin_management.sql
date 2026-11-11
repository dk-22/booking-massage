alter table public.admin_emails add column if not exists updated_at timestamptz not null default now();

create or replace function public.admin_directory(p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_page<0 then raise exception 'Invalid page.'; end if;
 select jsonb_build_object('total',(select count(*) from public.admin_emails a where concat_ws(' ',a.full_name,a.email) ilike '%'||trim(p_search)||'%'),
 'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select a.email,a.full_name,a.enabled,a.updated_at from public.admin_emails a where concat_ws(' ',a.full_name,a.email) ilike '%'||trim(p_search)||'%' order by a.enabled desc,a.full_name nulls last,a.email limit 25 offset p_page*25) r),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.save_administrator(p_email text,p_full_name text,p_expected timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare target public.admin_emails; normalized text:=lower(trim(p_email));
begin
 perform pg_advisory_xact_lock(hashtext('pause-admin-management'));
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if normalized is null or length(normalized)>254 or normalized!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 1 and 120 then raise exception 'Enter a full name (up to 120 characters).'; end if;
 select * into target from public.admin_emails where email=normalized for update;
 if found then
  if p_expected is null then raise exception 'This administrator already exists. Edit the existing record.'; end if;
  if target.updated_at<>p_expected then raise exception 'This administrator was changed by someone else. Reload and try again.'; end if;
  update public.admin_emails set full_name=trim(p_full_name),updated_at=clock_timestamp() where email=normalized;
 else
  if p_expected is not null then raise exception 'Administrator no longer exists. Reload the list.'; end if;
  insert into public.admin_emails(email,full_name,enabled) values(normalized,trim(p_full_name),true);
 end if;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),case when p_expected is null then 'admin.create' else 'admin.update' end,jsonb_build_object('email',normalized,'fullName',trim(p_full_name)));
end $$;

create or replace function public.set_administrator_status(p_email text,p_enabled boolean,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare target public.admin_emails;
begin
 perform pg_advisory_xact_lock(hashtext('pause-admin-management'));
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_enabled is null then raise exception 'Choose an administrator status.'; end if;
 select * into target from public.admin_emails where email=lower(trim(p_email)) for update;
 if not found then raise exception 'Administrator no longer exists. Reload the list.'; end if;
 if p_expected is null or target.updated_at<>p_expected then raise exception 'This administrator was changed by someone else. Reload and try again.'; end if;
 if not p_enabled and target.email=(select lower(email) from auth.users where id=auth.uid()) then raise exception 'You cannot deactivate your own account.'; end if;
 if not p_enabled and target.enabled and (select count(*) from public.admin_emails where enabled)<2 then raise exception 'Keep at least one active administrator.'; end if;
 update public.admin_emails set enabled=p_enabled,updated_at=clock_timestamp() where email=target.email;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'admin.status',jsonb_build_object('email',target.email,'enabled',p_enabled));
end $$;
revoke all on function public.admin_directory(text,integer),public.save_administrator(text,text,timestamptz),public.set_administrator_status(text,boolean,timestamptz) from public,anon;
grant execute on function public.admin_directory(text,integer),public.save_administrator(text,text,timestamptz),public.set_administrator_status(text,boolean,timestamptz) to authenticated;
