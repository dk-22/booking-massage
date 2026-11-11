import {Component,Input,Output,EventEmitter,signal,ViewChild,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {rpc} from './backend';
import {UI_IMPORTS} from './ui';
import {HlmDialog} from './ui/dialog';
import {HlmAlertDialog} from './ui/alert-dialog';
@Component({selector:'admin-users',standalone:true,imports:[UI_IMPORTS,FormsModule],templateUrl:'./admin-users.html'})
export class AdminUsers implements OnDestroy{
 @Input() currentEmail='';@Output() saved=new EventEmitter<string>();@Output() profileChanged=new EventEmitter<void>();
 @ViewChild('editor') editor?:HlmDialog;@ViewChild('statusDialog') statusDialog?:HlmAlertDialog;
 rows=signal<any[]>([]);total=signal(0);loading=signal(true);busy=signal(false);error=signal('');editError=signal('');statusError=signal('');search='';page=0;draft:any=null;target:any=null;request=0;timer?:ReturnType<typeof setTimeout>;
 constructor(){void this.load();}ngOnDestroy(){clearTimeout(this.timer);this.request++;}
 filter(){this.page=0;this.loading.set(true);clearTimeout(this.timer);this.timer=setTimeout(()=>void this.load(),250);}
 async load(){const sequence=++this.request;this.loading.set(true);this.error.set('');try{const result=await rpc('admin_directory',{p_search:this.search.trim(),p_page:this.page});if(sequence!==this.request)return;this.rows.set(result.rows);this.total.set(result.total);}catch(e:any){if(sequence===this.request)this.error.set(e.code==='PGRST202'?'Apply database migration 014 to enable administrator management.':e.message||'Unable to load administrators.');}finally{if(sequence===this.request)this.loading.set(false);}}
 move(delta:number){this.page+=delta;void this.load();}
 edit(row?:any){this.draft=row?{...row}:{full_name:'',email:''};this.editError.set('');this.editor?.open();}
 async save(){if(this.busy()||!this.draft)return;this.busy.set(true);this.editError.set('');try{await rpc('save_administrator',{p_email:this.draft.email.trim().toLowerCase(),p_full_name:this.draft.full_name.trim(),p_expected:this.draft.updated_at||null});const own=this.draft.email.toLowerCase()===this.currentEmail.toLowerCase();this.editor?.close();this.saved.emit('Administrator saved.');if(own)this.profileChanged.emit();await this.load();}catch(e:any){this.editError.set(e.message||'Unable to save administrator.');}finally{this.busy.set(false);}}
 confirmStatus(row:any){this.target={...row};this.statusError.set('');this.statusDialog?.open();}
 async changeStatus(){if(this.busy()||!this.target)return;this.busy.set(true);this.statusError.set('');try{await rpc('set_administrator_status',{p_email:this.target.email,p_enabled:!this.target.enabled,p_expected:this.target.updated_at});this.statusDialog?.close();this.saved.emit(this.target.enabled?'Administrator deactivated.':'Administrator reactivated.');await this.load();}catch(e:any){this.statusError.set(e.message||'Unable to change administrator status.');}finally{this.busy.set(false);}}
}
