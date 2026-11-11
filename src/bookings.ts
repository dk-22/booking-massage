import {NgTemplateOutlet} from '@angular/common';
import {HlmAlertDialog} from './ui/alert-dialog';
import {HlmDialog} from './ui/dialog';
import {UI_IMPORTS} from './ui';
import {Component,Input,Output,EventEmitter,OnInit,OnDestroy,signal,ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {supabase,rpc,watch,readAll} from './backend';
@Component({selector:'admin-bookings',standalone:true,imports:[UI_IMPORTS,FormsModule,NgTemplateOutlet],templateUrl:'./bookings-page.html'})
export class BookingManager implements OnInit,OnDestroy{
 @Input() campaign:any;@Input() campaignChoices:any[]=[];@Output() campaignChange=new EventEmitter<string>();
 campaignLabel=(id:string)=>this.campaignChoices.find(c=>c.id===id)?.name||this.campaign.name;status='';statusLabel=(value:string)=>({confirmed:'Confirmed',cancelled:'Cancelled'}[value]||'All statuses');
@Output() back=new EventEmitter<void>();@Output() saved=new EventEmitter<string>();@ViewChild('editor') editor?:HlmDialog;@ViewChild('confirmation') confirmation?:HlmAlertDialog;original:any=null;
 @ViewChild('cancelDialog') cancelDialog?:HlmAlertDialog;cancelTarget:any=null;cancelling=signal(false);cancelError=signal('');
 requestCancel(booking:any){this.cancelTarget={...booking};this.cancelError.set('');this.cancelDialog?.open();}
 cancelledTime(value:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}
 async cancelBooking(){if(this.cancelling()||!this.cancelTarget)return;this.cancelling.set(true);this.cancelError.set('');try{await rpc('cancel_booking',{p_id:this.cancelTarget.id,p_expected:this.cancelTarget.updated_at});this.cancelDialog?.close();this.slotCacheDirty=true;await this.load();this.saved.emit('Booking cancelled.');}catch(e:any){this.cancelError.set(e.code==='PGRST202'?'Apply database migration 015 to enable booking cancellation.':e.message||'Unable to cancel the booking. Please try again.');}finally{this.cancelling.set(false);}}
 page=0;total=signal(0);refreshTimer?:ReturnType<typeof setTimeout>;loadId=0;bookings=signal<any[]>([]);loading=signal(true);saving=signal(false);error=signal('');editError=signal('');slots:any[]=[];slotCacheDirty=false;sbus:string[]=[];search='';date='';draft:any=null;originalSlot='';stops:(()=>void)[]=[];
 ngOnInit(){void this.load();this.stops.push(watch('bookings',()=>this.queueLoad(),'campaign_id=eq.'+this.campaign.id),watch('slots',()=>{this.slotCacheDirty=true;this.queueLoad();},'campaign_id=eq.'+this.campaign.id));}
 ngOnDestroy(){clearTimeout(this.refreshTimer);this.stops.forEach(s=>s());}
 queueLoad(){clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>void this.load(),200);}
 filterChanged(){this.loading.set(true);this.page=0;this.queueLoad();}
 changePage(delta:number){this.page=Math.max(0,this.page+delta);void this.load();}
 async load(){const id=++this.loadId;try{const [result,slots,units]=await Promise.all([rpc(this.status?'booking_page_filtered':'booking_page',{p_campaign:this.campaign.id,p_search:this.search.trim(),p_date:this.date||null,p_page:this.page,...(this.status?{p_status:this.status}:{})}),this.slots.length&&!this.slotCacheDirty?Promise.resolve(this.slots):readAll((a,b)=>supabase.from('slots').select('*').eq('campaign_id',this.campaign.id).order('start_time').order('id').range(a,b)),this.sbus.length?Promise.resolve(this.sbus.map(name=>({name}))):readAll((a,b)=>supabase.from('sbus').select('name').order('name').range(a,b))]);if(id!==this.loadId)return;this.slots=slots;this.slotCacheDirty=false;this.sbus=units.map(x=>x.name);this.total.set(result.total);this.bookings.set(result.rows);this.error.set('');if(this.page>0&&!result.rows.length){this.page--;void this.load();}}catch(e:any){this.error.set(e.code==='PGRST202'?this.status?'Apply database migration 016 to filter bookings by status.':'Apply database migration 012 to load booking pages.':'Unable to load bookings. Please try again.');}finally{if(id===this.loadId)this.loading.set(false);}}
 dateOptionLabel=(date:string)=>date?this.dateLabel(date):'All dates';
 bookingSlotLabel=(id:string)=>this.slotLabel(id);
 dayKey(t:string){return new Date(new Date(t).getTime()+4*3600000).toISOString().slice(0,10);}
 dayOf(b:any){const s=this.slots.find(s=>s.id===b.slot_id);return s?this.dayKey(s.start_time):'';}
 days(){return [...new Set(this.slots.map(s=>this.dayKey(s.start_time)))].sort();}
 dateLabel(day:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(day+'T12:00:00+04:00'));}
 timeLabel(id:string){const s=this.slots.find(s=>s.id===id);const f=(t:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Mauritius',hour:'2-digit',minute:'2-digit'}).format(new Date(t));return s?f(s.start_time)+'–'+f(s.end_time):'Unavailable';}
 allRows(){return this.bookings().slice().sort((a,b)=>{const sa=this.slots.find(s=>s.id===a.slot_id)?.start_time||'';const sb=this.slots.find(s=>s.id===b.slot_id)?.start_time||'';return sa.localeCompare(sb);});}
 rows(day:string){const q=this.search.trim().toLowerCase();return this.bookings().filter(b=>this.dayOf(b)===day&&(!q||[b.employee_name,b.employee_code,b.sbu].some(x=>x.toLowerCase().includes(q)))).sort((a,b)=>this.timeLabel(a.slot_id).localeCompare(this.timeLabel(b.slot_id)));}
 visibleDays(){return this.days().filter(day=>(!this.date||this.date===day)&&this.rows(day).length>0);}
 destinations(){return this.slots.filter(s=>s.id===this.originalSlot||(s.status==='active'&&new Date(s.start_time).getTime()>Date.now()&&s.booked_count<s.capacity));}
 edit(b:any){this.original={...b};this.draft={...b};this.originalSlot=b.slot_id;this.editError.set('');this.editor?.open();}
 close(){if(this.saving())return;this.editor?.close();}
 cancelEdit(e:Event){e.preventDefault();this.close();}
 changes(){if(!this.draft||!this.original)return [];const fields=[['employee_name','Full name'],['employee_code','Employee code'],['sbu','Business unit'],['slot_id','Date and time']];return fields.filter(([key])=>this.draft[key]!==this.original[key]).map(([key,label])=>({label,before:key==='slot_id'?this.slotLabel(this.original[key]):this.original[key],after:key==='slot_id'?this.slotLabel(this.draft[key]):this.draft[key]}));}
 slotLabel(id:string){const slot=this.slots.find(s=>s.id===id);return slot?this.dateLabel(this.dayKey(slot.start_time))+' · '+this.timeLabel(id):'Unavailable';}
 review(){if(!this.saving()&&this.changes().length){this.editError.set('');this.confirmation?.open();}}
 async save(){if(this.saving()||!this.draft)return;this.saving.set(true);this.editError.set('');try{await rpc('update_booking',{p_id:this.draft.id,p_slot_id:this.draft.slot_id,p_name:this.draft.employee_name,p_code:this.draft.employee_code,p_sbu:this.draft.sbu,p_expected:this.draft.updated_at});this.confirmation?.close();await this.editor?.close();this.draft=null;await this.load();this.saved.emit('Booking updated.');}catch(e:any){this.confirmation?.close();this.editError.set(e.code==='PGRST202'?'Apply database migration 009 to enable booking edits.':e.message||'Unable to save booking.');}finally{this.saving.set(false);}}
}
