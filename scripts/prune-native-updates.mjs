import {rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// OTA distribution archives belong to the web host, not inside the native app.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const generated=path.resolve(root,'dist','updates');
if(!generated.startsWith(path.resolve(root,'dist')+path.sep))throw new Error('Invalid generated assets target.');
await rm(generated,{recursive:true,force:true});
