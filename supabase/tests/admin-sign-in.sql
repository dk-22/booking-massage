begin;
insert into public.admin_emails(email,enabled) values('allowed@example.test',true),('disabled@example.test',false);
do $$ begin
 if public.allow_admin_sign_in_request('unknown@example.test') or public.allow_admin_sign_in_request('disabled@example.test') then raise exception 'Unauthorized email accepted';end if;
 if not public.allow_admin_sign_in_request(' ALLOWED@example.test ') then raise exception 'Enabled admin rejected';end if;
 if public.allow_admin_sign_in_request('allowed@example.test') then raise exception 'Cooldown not enforced';end if;
 if has_function_privilege('anon','public.allow_admin_sign_in_request(text)','EXECUTE') or has_function_privilege('authenticated','public.allow_admin_sign_in_request(text)','EXECUTE') then raise exception 'Eligibility check exposed';end if;
end $$;
rollback;
