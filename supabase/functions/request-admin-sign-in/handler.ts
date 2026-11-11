export const signInMessage='If this email has admin access, you’ll receive a sign-in link.';
export async function requestAdminSignIn(email:string,dependencies:{eligible:(email:string)=>Promise<boolean>;send:(email:string)=>Promise<void>}){
 const normalized=email.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254)return;
 if(await dependencies.eligible(normalized))await dependencies.send(normalized);
}

export function adminSignInRedirect(origin:string,requested:unknown,allowed:string[]){
 const fallback=origin+'/bk-admin-codex/login';
 const redirect= requested===undefined?fallback:requested;
 if(typeof redirect!=='string'||(redirect!==fallback&&!allowed.includes(redirect)))return null;
 try{
  const url=new URL(redirect);
  return url.origin===origin&&!url.username&&!url.password?redirect:null;
 }catch{return null;}
}
