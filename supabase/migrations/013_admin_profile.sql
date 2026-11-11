create or replace function public.current_admin_profile()
returns table(full_name text,email text)
language plpgsql stable security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 return query select a.full_name,a.email from public.admin_emails a
 join auth.users u on lower(u.email)=a.email
 where u.id=auth.uid() and a.enabled;
end;
$$;
revoke all on function public.current_admin_profile() from public,anon;
grant execute on function public.current_admin_profile() to authenticated;
