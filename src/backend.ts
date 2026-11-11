import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from './supabase-config';
export const configured=!!supabaseConfig.url && !!supabaseConfig.publishableKey;
export const supabase=createClient(supabaseConfig.url||'https://placeholder.supabase.co',supabaseConfig.publishableKey||'not-configured');
export async function rpc(name:string,args:Record<string,unknown>={}) {if(!configured)throw new Error('Configure your Supabase project first.');const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
export function watch(table:string,callback:()=>void,filter?:string){const channel=supabase.channel(table+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table,...(filter?{filter}:{})},callback).subscribe();return ()=>{void supabase.removeChannel(channel);};}
export function slotModel(s:any){return {...s,campaignId:s.campaign_id,startTime:s.start_time,endTime:s.end_time,bookedCount:s.booked_count};}

// Read collections in bounded requests instead of relying on the API's default row cap.
export async function readAll(build:(offset:number,end:number)=>PromiseLike<any>){const rows:any[]=[];for(let offset=0;;offset+=500){const result=await build(offset,offset+499);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<500)return rows;}}
