begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','history@example.com',now());
insert into public.admin_emails(email,enabled,full_name) values('history@example.com',true,'History Admin');
do $$
declare cid uuid;
begin
 insert into public.campaigns(name) values('History test') returning id into cid;
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'campaign.save',jsonb_build_object('campaignId',cid));
 update public.admin_emails set full_name='Changed Name' where email='history@example.com';
 if (select saved_by from public.campaign_save_info() where campaign_id=cid)<>'History Admin' then raise exception 'Actor snapshot lost'; end if;
 if (select count(*) from public.campaign_history(cid))<>1 then raise exception 'History missing'; end if;
 update public.admin_emails set enabled=false where email='history@example.com';
 begin
  perform public.campaign_history(cid);
  raise exception 'Expected rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
