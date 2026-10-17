import { env } from 'cloudflare:workers';
import type { Kind } from '@/lib/model';
export const dynamic = 'force-dynamic';
const db = () => { if (!env.DB) throw new Error('資料庫尚未連接'); return env.DB; };
const reply = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes as ArrayBuffer)).map(v=>v.toString(16).padStart(2,'0')).join('');
async function hash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2', salt:new TextEncoder().encode(salt), iterations:100000, hash:'SHA-256'}, key, 256));
}
async function rate(request: Request, category: string, max: number, ms: number) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const key = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(category+ip)));
  const now = Date.now();
  const row = await db().prepare('INSERT INTO limits(id,count,until) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN until < ? THEN 1 ELSE count+1 END, until=CASE WHEN until < ? THEN ? ELSE until END RETURNING count').bind(key,now+ms,now,now,now+ms).first<{count:number}>();
  return !!row && row.count <= max;
}
async function auth(request: Request, eventId: string) {
  if (!/^[a-f0-9]{12}$/.test(eventId)) return null;
  const password = request.headers.get('authorization')?.replace(/^Bearer /,'') || '';
  if (!password || password.length > 200) return null;
  const event = await db().prepare('SELECT * FROM events WHERE id=?').bind(eventId).first<any>();
  if (!event) return null;
  const computed = await hash(password,event.salt);
  let diff = computed.length ^ event.password_hash.length;
  for(let i=0;i<computed.length;i++) diff |= computed.charCodeAt(i) ^ (event.password_hash.charCodeAt(i) || 0);
  return diff === 0 ? event : null;
}
function clean(kind: Kind, input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('記錄格式不正確');
  const str = (v: any, max = 200) => typeof v === 'string' ? v.trim().slice(0,max) : '';
  const num = (v: any) => v === null || v === '' || v === undefined ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000000 ? v : (()=>{throw new Error('數值必須介乎 0 至 1000000');})();
  if(kind==='group') {
    const number = num(input.number); if(!number || !Number.isInteger(number)) throw new Error('組號必須是正整數');
    return {number,school:str(input.school),note:str(input.note,500),award:str(input.award,20),deleted:!!input.deleted};
  }
  if(kind==='student') {
    if(!str(input.name,80) || !str(input.groupId,80)) throw new Error('姓名及組別不可留空');
    return {name:str(input.name,80),groupId:str(input.groupId,80),present:input.present!==false,deleted:!!input.deleted};
  }
  if(kind==='attempt') {
    if(!str(input.groupId,80) || typeof input.hit !== 'boolean') throw new Error('請選擇命中或未命中');
    return {groupId:str(input.groupId,80),round:Math.max(1,Math.floor(num(input.round)||1)),hit:input.hit,score:num(input.score),distance:num(input.distance),note:str(input.note,500),teacher:str(input.teacher,80),participants:Array.isArray(input.participants)?input.participants.slice(0,100).map((s:any)=>({id:str(s.id,80),name:str(s.name,80)})):[],deleted:!!input.deleted};
  }
  if(kind==='settings') return {ranking:['hit','score','distance'].includes(input.ranking)?input.ranking:'hit'};
  throw new Error('不支援的記錄類型');
}
export async function GET(request: Request) {
  try {
    const eventId = new URL(request.url).searchParams.get('event') || '';
    const event = await auth(request,eventId);
    if(!event) { if(!await rate(request,'failed-read',30,600000)) return reply({error:'嘗試次數過多，請稍後再試。'},429); return reply({error:'活動代碼或密碼不正確。'},401); }
    const rows = await db().prepare('SELECT id,kind,data,version,updated_at FROM records WHERE event_id=?').bind(eventId).all<any>();
    return reply({event:{id:event.id,title:event.title}, records:rows.results.map(r=>({id:r.id,kind:r.kind,data:JSON.parse(r.data),version:r.version,updatedAt:r.updated_at})), serverTime:Date.now()});
  } catch { return reply({error:'暫時無法讀取雲端記錄，請稍後再試。'},503); }
}
export async function POST(request: Request) {
  try {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return reply({error:'不允許的請求來源'},403);
    const raw=await request.text(); if(raw.length>500000) return reply({error:'檔案過大，請分批匯入。'},413);
    const body=JSON.parse(raw);
    if(body.action==='create') {
      if(!await rate(request,'create',10,86400000)) return reply({error:'今天建立活動次數已達上限。'},429);
      if(typeof body.password!=='string' || body.password.length<10 || body.password.length>100) return reply({error:'活動密碼請使用至少 10 個字元。'},400);
      const eventId=crypto.randomUUID().replaceAll('-','').slice(0,12), salt=hex(crypto.getRandomValues(new Uint8Array(16)));
      const title=String(body.title||'小學科學體驗日').trim().slice(0,100);
      await db().prepare('INSERT INTO events(id,title,salt,password_hash,created_at) VALUES(?,?,?,?,?)').bind(eventId,title,salt,await hash(body.password,salt),Date.now()).run();
      return reply({event:{id:eventId,title}},201);
    }
    const eventId=String(body.eventId||'');
    if(!await auth(request,eventId)) { if(!await rate(request,'failed-write',30,600000)) return reply({error:'嘗試次數過多，請稍後再試。'},429); return reply({error:'活動代碼或密碼不正確。'},401); }
    if(body.action!=='write' || !Array.isArray(body.operations) || body.operations.length<1 || body.operations.length>80) return reply({error:'記錄數量不正確。'},400);
    const operations=body.operations.map((op:any)=> {
      if(!/^[A-Za-z0-9_-]{1,80}$/.test(op.id) || !/^[a-f0-9-]{36}$/.test(op.opId) || !Number.isInteger(op.expectedVersion) || op.expectedVersion<0) throw new Error('記錄識別碼不正確');
      return {...op,data:clean(op.kind,op.data)};
    });
    // Per-record versions and operation IDs prevent silent overwrites and duplicate retries.
    const now=Date.now();
    const statements=operations.map((op:any)=> op.expectedVersion===0
      ? db().prepare('INSERT OR IGNORE INTO records(event_id,id,kind,data,version,last_op,updated_at) VALUES(?,?,?,?,1,?,?) RETURNING id,version').bind(eventId,op.id,op.kind,JSON.stringify(op.data),op.opId,now)
      : db().prepare('UPDATE records SET data=?,version=version+1,last_op=?,updated_at=? WHERE event_id=? AND id=? AND version=? AND kind=? RETURNING id,version').bind(JSON.stringify(op.data),op.opId,now,eventId,op.id,op.expectedVersion,op.kind));
    const results=await db().batch(statements);
    const outcomes=[];
    for(let i=0;i<operations.length;i++) {
      const op=operations[i], changed=results[i].results[0] as any;
      if(changed) {outcomes.push({id:op.id,ok:true,version:changed.version});continue;}
      const current=await db().prepare('SELECT version,last_op FROM records WHERE event_id=? AND id=?').bind(eventId,op.id).first<any>();
      outcomes.push({id:op.id,ok:current?.last_op===op.opId,version:current?.version||0});
    }
    return reply({outcomes});
  } catch(error) {return reply({error:error instanceof Error && !/SQL|D1|binding/i.test(error.message)?error.message:'暫時無法同步，記錄仍保留在此裝置。'},400);}
}
