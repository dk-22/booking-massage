import {copyFile,mkdir,writeFile} from 'node:fs/promises';
const output=new URL('../dist/booking-massage/browser/',import.meta.url);
// Serve real entry documents for direct admin visits and magic-link callbacks.
for(const route of ['bk-admin-codex/','bk-admin-codex/login/']){
 const directory=new URL(route,output);
 await mkdir(directory,{recursive:true});
 await copyFile(new URL('index.html',output),new URL('index.html',directory));
}
await writeFile(new URL('.nojekyll',output),'');
