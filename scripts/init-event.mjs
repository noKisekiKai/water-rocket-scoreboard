// Administrative importer: configuration is read from stdin, never committed.
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
let input='';
for await (const chunk of process.stdin) { input+=chunk; if(input.includes('\n')) break; }
const config=JSON.parse(input.trim());
const base=new URL(config.url).origin;
const password=config.password||randomBytes(15).toString('base64url');
const api=async (method,body,eventId) => {
  const response=await fetch(base+'/api/rooms'+(method==='GET'?'?event='+eventId:''),{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+password},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();
  if(!response.ok) throw new Error(JSON.stringify(value));
  return value;
};
const event=config.eventId?{id:config.eventId,title:config.title}:(await api('POST',{action:'create',title:config.title,password})).event;
const roster=JSON.parse(readFileSync(config.rosterPath,'utf8'));
if(roster.schema!=='water-rocket-roster-v1') throw new Error('Invalid roster');
const operations=[];
for(const group of roster.groups) {
  operations.push({id:group.id,opId:randomUUID(),kind:'group',expectedVersion:0,data:{number:group.number,school:group.school,deleted:false}});
  group.students.forEach((name,index)=>operations.push({id:group.id+'-student-'+(index+1),opId:randomUUID(),kind:'student',expectedVersion:0,data:{groupId:group.id,name,present:true,deleted:false}}));
}
for(let start=0;start<operations.length;start+=60) {
  const result=await api('POST',{action:'write',eventId:event.id,operations:operations.slice(start,start+60)});
  if(result.outcomes.some(row=>!row.ok)) throw new Error('Import conflict; do not recreate event. Inspect existing records.');
}
const saved=await api('GET',null,event.id);
const groups=saved.records.filter(row=>row.kind==='group'&&!row.data.deleted).length;
const students=saved.records.filter(row=>row.kind==='student'&&!row.data.deleted).length;
if(groups!==roster.groups.length||students!==roster.groups.reduce((sum,g)=>sum+g.students.length,0)) throw new Error('Verification mismatch');
process.stdout.write(JSON.stringify({eventId:event.id,password,title:event.title,groups,students})+'\n');
