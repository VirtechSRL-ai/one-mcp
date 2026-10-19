import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const password=randomBytes(24).toString('hex');
let env=await readFile('.env.example','utf8');
env=env.replaceAll('CHANGE_ME',password).replace('REPLACE_WITH_64_HEX_CHARACTERS',randomBytes(32).toString('hex'));
try {await writeFile('.env',env,{flag:'wx',mode:0o600});console.log('Created .env with random local credentials.');}catch(e){if(e.code==='EEXIST')console.log('.env already exists; preserved.');else throw e;}
