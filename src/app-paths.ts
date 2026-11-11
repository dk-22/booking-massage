// Resolve navigation and sign-in against Angular's build-time base URL.
export const appBasePath=new URL(document.baseURI).pathname;
export const adminPath=appBasePath+'bk-admin-codex';
export const adminSignInUrl=new URL(adminPath+'/login',location.origin).href;
