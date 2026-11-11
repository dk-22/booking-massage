import {adminPath,adminSignInUrl} from './app-paths';
import {NgTemplateOutlet} from '@angular/common';
import {BrnCollapsibleImports} from '@spartan-ng/brain/collapsible';
import {HlmDropdownMenuTrigger} from './ui/dropdown-menu';
import {HlmSidebarService} from './ui/sidebar';
import {AdminUsers} from './admin-users';
import {HlmDialog} from './ui/dialog';
import {HlmAlertDialog} from './ui/alert-dialog';
import {toast as sonner} from '@spartan-ng/brain/sonner';
import {UI_IMPORTS} from './ui';
import {BookingManager} from './bookings';
import {Component,signal,OnDestroy,ViewChild,inject,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {configured,supabase,rpc,watch,readAll} from './backend';
@Component({selector:'admin-portal',standalone:true,imports:[UI_IMPORTS,FormsModule,BookingManager,AdminUsers,NgTemplateOutlet,BrnCollapsibleImports],templateUrl:'./admin-page.html'})
export class AdminPortal implements OnDestroy {
 sidebar=inject(HlmSidebarService);
 adminUsers=viewChild(AdminUsers);
 get pageTitle(){
  if(this.bookingCampaign||this.tab==='bookings')return 'Bookings';
  if(this.editing)return this.editingId?'Edit campaign':'New campaign';
  if(this.tab==='admins')return 'Administrators';
  return this.tab==='settings'?'Business units':'Campaigns';
 }
 get campaignSaveAction(){
  if(this.publishOnSave&&this.editingStatus!=='published')return 'Save and publish';
  if(!this.publishOnSave&&this.editingStatus==='published')return 'Save and unpublish';
  return this.editingId?'Save changes':'Save campaign';
 }
 get campaignSaveDescription(){
  if(this.pendingSaveStatus==='published'){
   return this.editingStatus==='published'?'Employees can continue to see and book this campaign.':'Employees will be able to see and book this campaign after you save.';
  }
  return this.editingStatus==='published'
   ?'Employees will no longer be able to see or book this campaign. Existing bookings will be kept.'
   :'Only admins can see this campaign. Employees can’t view or book it.';
 }
 campaignResultRange(){
  const total=this.campaignTotal();
  if(!this.campaigns().length)return total===1?'1 campaign':`${total} campaigns`;
  const start=this.campaignPage*10+1;
  const end=start+this.campaigns().length-1;
  return `Showing ${start}–${end} of ${total} ${total===1?'campaign':'campaigns'}`;
 }
 @ViewChild('accountTrigger') accountTrigger?:HlmDropdownMenuTrigger;
 closeAccountMenu(event:Event){event.preventDefault();event.stopPropagation();this.accountTrigger?.close();}
 @ViewChild('historyDialog') historyDialog?:HlmDialog;saveInfo=signal<Record<string,any>>({});historyCampaign:any=null;historyEvents=signal<any[]>([]);historyLoading=signal(false);historyError=signal('');
 @ViewChild('dateDialog') dateDialog?:HlmDialog;dateDraft:any=null;dateIndex=-1;pendingDateRemoval='';
 @ViewChild('campaignStatusDialog') campaignStatusDialog?:HlmAlertDialog;statusTarget:{id:string;name:string;status:string}|null=null;statusError=signal('');
 requestCampaignStatus(campaign:any,status:'closed'|'published'){if(this.busy())return;this.statusTarget={id:campaign.id,name:campaign.name,status};this.statusError.set('');this.campaignStatusDialog?.open();}
 @ViewChild('signOutDialog') signOutDialog?:HlmAlertDialog;signingOut=signal(false);
 @ViewChild('discardDateDialog') discardDateDialog?:HlmAlertDialog;discardDateTarget:any=null;
 requestDateDiscard(index:number){this.discardDateTarget=this.dates[index]||null;if(this.discardDateTarget)this.discardDateDialog?.open();}
 confirmDateDiscard(){const index=this.dates.indexOf(this.discardDateTarget);if(index>=0)this.removeDate(index);this.discardDateDialog?.close();}
 @ViewChild('removeDateDialog') removeDateDialog?:HlmAlertDialog;
 loginNotice=signal('');resendSeconds=signal(0);resendTimer?:ReturnType<typeof setInterval>;dateError=signal('');saveError=signal('');ready=signal(false);admin=signal(false);busy=signal(false);campaigns=signal<any[]>([]);sessions=signal<any[]>([]);email='';linkSent=signal(false);name='';description='';sbus='';selected='';date='';start='10:00';end='15:00';duration=30;pause=0;capacity=3;stops:(()=>void)[]=[];
 recentCampaign='';bookingCampaign:any=null;campaignLoading=signal(true);campaignError=signal('');campaignPage=0;campaignTotal=signal(0);campaignLoadId=0;dataStops:(()=>void)[]=[];campaignRefresh?:ReturnType<typeof setTimeout>;search='';statusFilter='all';publishOnSave=false;saveRequestId='';savePayload='';pendingSaveStatus:string|null=null;removedSessions:string[]=[];deleteTarget:any=null;tab='campaigns';editing=false;editingId='';editingStatus='draft';dates:any[]=[];slotRows:any[]=[];
 statusOptionLabel=(value:string)=>({all:'All campaigns',published:'Open for bookings',draft:'Unpublished',closed:'Closed'}[value]||value);
 bookingCampaignLabel=(id:string)=>this.bookingChoices().find(c=>c.id===id)?.name||'';
 bookingChoices=signal<any[]>([]);bookingChoicesLoading=signal(false);bookingChoicesError=signal('');bookingSelection='';
 navigate(section:string){this.tab=section;this.bookingCampaign=null;this.editing=false;if(section==='bookings'){this.bookingSelection='';void this.loadBookingChoices();}}
 async loadBookingChoices(){this.bookingChoicesLoading.set(true);this.bookingChoicesError.set('');try{this.bookingChoices.set(await readAll((a,b)=>supabase.from('campaigns').select('id,name,status').order('created_at',{ascending:false}).order('id').range(a,b)));this.bookingSelection=this.bookingChoices()[0]?.id||'';this.selectBookingCampaign();}catch{this.bookingChoicesError.set('Unable to load campaigns. Please try again.');}finally{this.bookingChoicesLoading.set(false);}}
 selectBookingCampaign(){this.bookingCampaign=this.bookingChoices().find(c=>c.id===this.bookingSelection)||null;}
 refreshProfile(){void supabase.auth.getSession().then(({data})=>{if(data.session)void this.loadProfile(data.session.user);});}
 profileName=signal('');profileEmail=signal('');profileLoading=signal(true);
 initials(){const name=this.profileName().trim();const words=(name||this.profileEmail().split('@')[0].replace(/[._-]+/g,' ')).split(/\s+/).filter(Boolean);return words.slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()||'A';}
 async loadProfile(user:any){this.profileEmail.set(user.email||'');this.profileName.set(user.user_metadata?.full_name||user.user_metadata?.name||'');this.profileLoading.set(true);try{const rows=await rpc('current_admin_profile');if(rows?.[0]){this.profileName.set(rows[0].full_name||this.profileName());this.profileEmail.set(rows[0].email||user.email||'');}}catch{}finally{this.profileLoading.set(false);}}
 constructor(){
 if(!configured){this.showError('Configure your Supabase project first.');this.ready.set(true);return;}
 const params=new URLSearchParams(location.hash.slice(1));if(params.get('error_description'))this.showError(params.get('error_description')!);
 void this.checkAccess();
 const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(()=>void this.checkAccess(),0);});this.stops.push(()=>data.subscription.unsubscribe());
 }
 notify(text:string,type:'success'|'error'='success'){if(!text){sonner.dismiss('admin-notification');return;}sonner[type](text,{id:'admin-notification',duration:type==='error'?10000:6500});}
 showError(text:string){this.notify(text,'error');}
 timeMenu='';
 timeHours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));timeMinutes=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'));
 timePart(field:'start'|'end',part:number){return this.dateDraft?.[field]?.split(':')[part]||'00';}
 setTimePart(field:'start'|'end',part:number,value:string){const pieces=[this.timePart(field,0),this.timePart(field,1)];pieces[part]=value;this.dateDraft[field]=pieces.join(':');}
 pickerValue='';pickerValueDate:Date|null=null;
 pickerDate(value:string){if(value!==this.pickerValue){this.pickerValue=value;const [year,month,day]=(value||'').split('-').map(Number);this.pickerValueDate=value?new Date(year,month-1,day):null;}return this.pickerValueDate;}
 setPickerDate(value:Date|null){this.dateDraft.date=value ? [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-') : '';}
 formatPickerDate=(date:Date)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(date);
 validateDate(day:any){if(!day?.date||!day.start||!day.end)return 'Choose a date, start time and end time.';const start=Date.parse(day.date+'T'+day.start+':00+04:00');if(!Number.isFinite(start)||start<=Date.now())return 'The selected start time has already passed. Choose a future date and time (Mauritius time).';if(day.end<=day.start)return 'End time must be later than start time.';if(this.datePreview(day)<1)return 'The session is too short for one massage. Extend the end time or reduce the massage duration.';if(this.datePreview(day)>240)return 'This session creates more than 240 time slots. Shorten the session or increase the massage duration.';return '';}
 validateCampaignDates(){for(const day of this.dates){const error=this.validateDate(day);if(error){this.saveError.set(this.readableDate(day.date)+': '+error);this.showError(error);return false;}}this.saveError.set('');return true;}
 async checkAccess(){try{const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session){this.admin.set(false);return;}if(!await rpc('is_admin')){this.admin.set(false);await supabase.auth.signOut();this.showError('This email address is not authorized for the admin portal. Contact your administrator.');return;}if(!this.admin()){this.admin.set(true);void this.loadProfile(data.session.user);this.ready.set(true);history.replaceState(null,'',adminPath);await this.load();this.stops.push(watch('campaigns',()=>this.queueCampaignLoad()));}}catch{this.showError('Unable to verify access. Please try again.');}finally{this.ready.set(true);}}
 queueCampaignLoad(){clearTimeout(this.campaignRefresh);this.campaignRefresh=setTimeout(()=>void this.load(),200);}
 retryCampaigns(){this.campaignLoading.set(true);void this.load();}
 campaignFilterChanged(){this.campaignLoading.set(true);this.campaignPage=0;this.queueCampaignLoad();}
 campaignPageChange(delta:number){this.campaignLoading.set(true);this.campaignPage=Math.max(0,this.campaignPage+delta);void this.load();}
 async load(){const sequence=++this.campaignLoadId;this.campaignError.set('');try{let query=supabase.from('campaigns').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id');if(this.statusFilter!=='all')query=query.eq('status',this.statusFilter);if(this.search.trim())query=query.ilike('name','%'+this.search.trim()+'%');const c=await query.range(this.campaignPage*10,this.campaignPage*10+9);if(c.error)throw c.error;const ids=(c.data||[]).map(x=>x.id);const [sessions,slots,units]=await Promise.all([ids.length?readAll((a,b)=>supabase.from('sessions').select('*').in('campaign_id',ids).order('id').range(a,b)):Promise.resolve([]),ids.length?readAll((a,b)=>supabase.from('slots').select('*').in('campaign_id',ids).order('start_time').order('id').range(a,b)):Promise.resolve([]),readAll((a,b)=>supabase.from('sbus').select('name').order('name').range(a,b))]);if(sequence!==this.campaignLoadId)return;this.slotRows=slots;this.campaigns.set(c.data||[]);this.campaignTotal.set(c.count||0);this.sessions.set(sessions.map(x=>({...x,campaignId:x.campaign_id})));this.sbus=units.map(x=>x.name).join(', ');this.dataStops.forEach(stop=>stop());this.dataStops=ids.flatMap(id=>['slots','sessions'].map(table=>watch(table,()=>this.queueCampaignLoad(),'campaign_id=eq.'+id)));try{const info=await rpc('campaign_save_info_page',{p_ids:ids});if(sequence===this.campaignLoadId)this.saveInfo.set(Object.fromEntries((info||[]).filter((x:any)=>ids.includes(x.campaign_id)).map((x:any)=>[x.campaign_id,x])));}catch{this.saveInfo.set({});}if(this.campaignPage>0&&!c.data?.length){this.campaignPage--;void this.load();}}catch{if(sequence===this.campaignLoadId){this.campaignError.set('Please check your connection and try again.');this.showError('Unable to load management data. Please try again.');}}finally{if(sequence===this.campaignLoadId)this.campaignLoading.set(false);}}
 ngOnDestroy(){sonner.dismiss('admin-notification');clearTimeout(this.campaignRefresh);this.dataStops.forEach(stop=>stop());clearInterval(this.resendTimer);this.stops.forEach(s=>s());}
 async login(){if(this.busy()||!configured||this.resendSeconds()>0)return;this.loginNotice.set('');this.busy.set(true);this.notify('');try{const {error}=await supabase.functions.invoke('request-admin-sign-in',{body:{email:this.email.trim(),redirectTo:adminSignInUrl}});if(error)throw error;this.linkSent.set(true);this.startResendCooldown();this.notify('If this email has admin access, you’ll receive a sign-in link.');}catch(e:any){const limited=e.status===429||e.code==='over_email_send_rate_limit'||e.code==='over_request_rate_limit';const text=limited?'Sign-in email limit reached. Wait for the limit to reset, or ask your project administrator to configure custom SMTP. Your admin permission is separate from this email limit.':'Unable to request a sign-in link. Please try again.';if(limited)this.startResendCooldown();this.loginNotice.set(text);this.showError(text);}finally{this.busy.set(false);}}
 startResendCooldown(){clearInterval(this.resendTimer);this.resendSeconds.set(60);this.resendTimer=setInterval(()=>{this.resendSeconds.update(n=>Math.max(0,n-1));if(this.resendSeconds()===0)clearInterval(this.resendTimer);},1000);}
 async logout(){if(this.signingOut())return;this.signingOut.set(true);try{const {error}=await supabase.auth.signOut();if(error)throw error;this.signOutDialog?.close();this.admin.set(false);this.profileName.set('');this.profileEmail.set('');history.replaceState(null,'',adminPath+'/login');}catch{this.showError('Unable to sign out. Please try again.');}finally{this.signingOut.set(false);}}

 async call(data:any){if(this.busy())return false;this.busy.set(true);this.notify('');try{await rpc('manage_campaign',{d:data});await this.load();this.notify('Changes saved.');return true;}catch(e:any){this.showError(e.message||'Unable to save changes.');return false;}finally{this.busy.set(false);}}
 async deleteCampaign(){if(this.busy()||!this.deleteTarget)return;this.busy.set(true);try{await rpc('delete_campaign',{p_campaign_id:this.deleteTarget.id});this.deleteTarget=null;await this.load();this.notify('Campaign deleted.');}catch(e:any){this.deleteTarget=null;this.showError(e.message||'Unable to delete campaign.');}finally{this.busy.set(false);}}
 historyTime(t:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(t));}
 historyAction(event:any){const labels:Record<string,string>={'campaign.save':'Campaign saved','campaign.create':'Campaign created','session.create':'Massage date added','session.remove_or_replace':'Massage date removed or replaced','booking.update':'Booking edited','booking.cancel':'Booking cancelled','campaign.delete':'Campaign deleted'};return event.action==='campaign.status' ? (event.details?.status==='published'?'Bookings opened':event.details?.status==='closed'?'Bookings closed':'Campaign unpublished') : labels[event.action]||'Campaign updated';}
 historyDay(t:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',day:'numeric',month:'long',year:'numeric'}).format(new Date(t));}
 historyClock(t:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',hour:'2-digit',minute:'2-digit'}).format(new Date(t));}
 historyGroups(){const groups:{day:string;events:any[]}[]=[];for(const event of this.historyEvents()){const day=this.historyDay(event.occurred_at);let group=groups[groups.length-1];if(!group||group.day!==day){group={day,events:[]};groups.push(group);}group.events.push(event);}return groups;}
 historyDetails(event:any){const d=event.details||{};const labels:Record<string,string>={name:'Name',description:'Description',employeeName:'Employee',employeeCode:'Employee code',sbu:'Business unit',previousStatus:'Previous status',status:'Saved status',date:'Date',start:'Start',end:'End',duration:'Duration (minutes)',capacity:'Places per slot'};return Object.entries(labels).filter(([key])=>d[key]!==undefined&&d[key]!==null&&typeof d[key]!=='object').map(([key,label])=>({label,value:['status','previousStatus'].includes(key)?({published:'Bookings open',closed:'Bookings closed',draft:'Unpublished'}[d[key] as string]||String(d[key])):String(d[key])}));}
 async viewHistory(c:any){this.historyCampaign=c;this.historyEvents.set([]);this.historyLoading.set(true);this.historyError.set('');this.historyDialog?.open();try{this.historyEvents.set(await rpc('campaign_history',{p_campaign_id:c.id})||[]);}catch(e:any){this.historyError.set(e.code==='PGRST202'?'Apply database migration 010 to enable campaign history.':e.message||'Unable to load history.');}finally{this.historyLoading.set(false);}}
 campaignBookings(id:string){return this.slotRows.filter(s=>s.campaign_id===id).reduce((n,s)=>n+s.booked_count,0);}
 filteredCampaigns(){return this.campaigns();}
 campaignDates(id:string){return [...new Set(this.slotRows.filter(s=>s.campaign_id===id).map(s=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',day:'numeric',month:'short',year:'numeric'}).format(new Date(s.start_time))))];}
 openEditor(c?:any){this.bookingCampaign=null;this.tab='campaigns';this.editing=true;this.saveError.set('');this.editingId=c?.id||'';this.editingStatus=c?.status||'draft';this.publishOnSave=c ? c.status==='published' : false;this.name=c?.name||'';this.description=c?.description||'';this.dates=[];this.removedSessions=[];}
 addDate(){this.openDate({date:'',start:'10:00',end:'15:00',duration:30,breakDuration:0,capacity:3});}
 readableDate(day:string){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Indian/Mauritius'}).format(new Date(day+'T12:00:00+04:00'));}
 openDate(day:any,index=-1){this.timeMenu='';this.dateError.set('');this.dateDraft={...day};this.dateIndex=index;this.dateDialog?.open();}
 cancelDate(){this.dateDialog?.close();}
 applyDate(){if(!this.dateDraft)return;const error=this.validateDate(this.dateDraft);this.dateError.set(error);if(error)return;if(this.dateIndex>=0)this.dates[this.dateIndex]={...this.dateDraft};else this.dates.push({...this.dateDraft});this.cancelDate();}
 datePreview(d:any){const minutes=(s:string)=>Number(s.split(':')[0])*60+Number(s.split(':')[1]);return Math.max(0,Math.floor((minutes(d.end)-minutes(d.start)+Number(d.breakDuration))/(Number(d.duration)+Number(d.breakDuration))))||0;}
 editScheduled(id:string){if(this.dates.some(d=>d.sessionId===id))return;const slots=this.slotRows.filter(s=>s.session_id===id).sort((a,b)=>a.start_time.localeCompare(b.start_time));if(!slots.length){this.showError('No time slots found for this date.');return;}if(slots.some(s=>s.booked_count>0)){this.showError('This date has bookings and cannot be changed.');return;}const first=slots[0],last=slots[slots.length-1];const local=(v:string)=>new Date(new Date(v).getTime()+4*3600000).toISOString();const duration=(new Date(first.end_time).getTime()-new Date(first.start_time).getTime())/60000;const pause=slots.length>1?(new Date(slots[1].start_time).getTime()-new Date(first.end_time).getTime())/60000:0;this.openDate({sessionId:id,date:local(first.start_time).slice(0,10),start:local(first.start_time).slice(11,16),end:local(last.end_time).slice(11,16),duration,breakDuration:pause,capacity:first.capacity});}
 requestDateRemoval(id:string){if(this.slotRows.some(s=>s.session_id===id&&s.booked_count>0)){this.showError('This date has bookings and cannot be deleted.');return;}this.pendingDateRemoval=id;this.removeDateDialog?.open();}
 confirmDateRemoval(){if(this.pendingDateRemoval)this.removeScheduled(this.pendingDateRemoval);this.cancelDateRemoval();}
 async cancelDateRemoval(){await this.removeDateDialog?.close();this.pendingDateRemoval='';}
 removeScheduled(id:string){if(this.slotRows.some(s=>s.session_id===id && s.booked_count>0)){this.showError('This date has bookings and cannot be deleted.');return;}if(!this.removedSessions.includes(id))this.removedSessions.push(id);this.notify('Date removed from your changes. Click Save campaign to confirm.');}
 removeDate(i:number){const d=this.dates[i];if(d.sessionId){this.dates.splice(i,1);this.notify('Edit cancelled. The original date is unchanged.');}else{this.dates.splice(i,1);this.notify('New date discarded.');}}
 existingDates(){return this.sessions().filter(s=>s.campaignId===this.editingId && !this.removedSessions.includes(s.id) && !this.dates.some(d=>d.sessionId===s.id)).map(s=>{const slots=this.slotRows.filter(x=>x.session_id===s.id);return {id:s.id,label:slots.length ? new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(slots[0].start_time))+' · '+slots.length+' slots' : 'Session configured'};});}
 confirmSave(status:string){if(this.busy()||!this.validateCampaignDates())return;this.pendingSaveStatus=status;}
 async acceptSave(){const status=this.pendingSaveStatus;if(status===null)return;this.pendingSaveStatus=null;await this.saveEditor(status);}
 async saveEditor(status:string){if(this.busy())return;if(!this.validateCampaignDates())return;const wasPublished=this.editingStatus==='published';this.busy.set(true);try{const payload={id:this.editingId,name:this.name,description:this.description,status,dates:this.dates,removedSessions:this.removedSessions};const serialized=JSON.stringify(payload);if(serialized!==this.savePayload){this.savePayload=serialized;this.saveRequestId=crypto.randomUUID();}await rpc('save_campaign_v2',{d:{...payload,requestId:this.saveRequestId}});this.recentCampaign=this.editingId;this.editing=false;await this.load();this.notify(status==='published'&&!wasPublished?'Campaign published. Bookings are open.':status==='draft'&&wasPublished?'Campaign unpublished.':'Campaign saved.');}catch(e:any){const error=e.code==='PGRST202'?'Database update required: apply migration 005 before saving scheduled dates.':e.message==='Choose a future session with 1–240 slots.'?'A massage date is invalid. Check that its start time is in the future, its end time is later, and it creates 1–240 slots.':e.message||'Unable to save campaign. Please try again.';this.saveError.set(error);this.showError(error);}finally{this.busy.set(false);}}
 async change(){if(this.busy()||!this.statusTarget)return;const target=this.statusTarget;this.busy.set(true);this.statusError.set('');try{await rpc('set_campaign_status',{p_campaign_id:target.id,p_status:target.status});this.campaignStatusDialog?.close();this.recentCampaign=target.id;await this.load();this.notify(target.status==='published'?'Campaign published. Bookings are open.':'Bookings closed.');}catch(e:any){this.statusError.set(e.code==='PGRST202'?'Apply database migration 006 to enable publishing.':e.message||'Unable to update campaign. Please try again.');}finally{this.busy.set(false);}}

 addSession(){return this.call({action:'session',campaignId:this.selected,date:this.date,start:this.start,end:this.end,duration:this.duration,breakDuration:this.pause,capacity:this.capacity});}
 async saveSbus(){if(this.busy())return;this.busy.set(true);try{await rpc('save_sbus',{p_names:this.sbus});await this.load();this.notify('Business units saved.');}catch(e:any){this.showError(e.code==='PGRST202'?'Apply database migration 011 to enable saving business units.':e.message||'Unable to save business units.');}finally{this.busy.set(false);}}
 count(id:string){return this.sessions().filter(s=>s.campaignId===id).length;}
 preview(){const minutes=(s:string)=>Number(s.split(':')[0])*60+Number(s.split(':')[1]);return Math.max(0,Math.floor((minutes(this.end)-minutes(this.start)+this.pause)/(this.duration+this.pause)))||0;}
}
