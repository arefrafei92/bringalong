import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import ts from 'typescript';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys = ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
function statement(sql){let values=[];return {bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}}}}}
const db={prepare:statement,async batch(statements){sqlite.exec('BEGIN');try{const r=await Promise.all(statements.map(s=>s.run()));sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const templateJS=ts.transpileModule(readFileSync('lib/templates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const templateExports={};new Function('exports',templateJS)(templateExports);
const code=ts.transpileModule(readFileSync('app/api/planner/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};new Function('exports','require',code)(api,id=>id==='@/db/raw'?{database:()=>db}:templateExports);
function request(user,body,group){const headers={'Content-Type':'application/json',origin:'https://planner.test'};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user+'@example.com'}return new Request('https://planner.test/api/planner'+(group?'?group='+group:''),{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})})}
async function post(user,body){const r=await api.POST(request(user,body));return {status:r.status,data:await r.json()}}
async function get(user,group){const r=await api.GET(request(user,null,group));return {status:r.status,data:await r.json()}}
test('shared gathering lifecycle, membership isolation, and quantity validation',async()=>{
 assert.equal((await get(null)).status,401);
 const created=await post('alice',{action:'create',name:'Weekend camp',occasion:'Camping',prefill:true});assert.equal(created.status,200);const gid=created.data.id;
 let a=await get('alice',gid);assert.equal(a.data.items.length,9);assert.equal(a.data.members.length,1);const code=a.data.groups[0].code;
 assert.equal((await get('bob',gid)).status,403);
 assert.equal((await post('bob',{action:'saveItem',groupId:gid,name:'Ice',quantity:1,unit:'bag',category:'Drinks'})).status,403);
 assert.equal((await post('bob',{action:'join',code:'wrong-code'})).status,404);
 assert.equal((await post('bob',{action:'join',code:code.toLowerCase()})).status,200);
 const b=await get('bob',gid);assert.equal(b.data.members.length,2);assert.equal(b.data.items.length,9);
 const id=b.data.items[0].id;
 await post('bob',{action:'claim',groupId:gid,id});
 a=await get('alice',gid);assert.equal(a.data.items.find(i=>i.id===id).assignee,'bob');
 await post('alice',{action:'claim',groupId:gid,id});
 a=await get('alice',gid);assert.equal(a.data.items.find(i=>i.id===id).assignee,'bob');
 const edited={action:'saveItem',groupId:gid,id,name:'Two tents',quantity:2,unit:'each',category:'Equipment',assignee:'bob',note:'Waterproof'};
 assert.equal((await post('alice',{...edited,quantity:-1})).status,400);
 assert.equal((await post('alice',{...edited,assignee:'stranger'})).status,403);
 assert.equal((await post('alice',edited)).status,200);
 await post('bob',{action:'packed',groupId:gid,id,packed:true});
 a=await get('alice',gid);assert.equal(a.data.items.find(i=>i.id===id).packed,1);assert.equal(a.data.items.find(i=>i.id===id).quantity,2);
 await post('alice',{...edited,assignee:null});a=await get('bob',gid);assert.equal(a.data.items.find(i=>i.id===id).packed,0);
 await post('bob',{action:'deleteItem',groupId:gid,id});a=await get('alice',gid);assert.equal(a.data.items.length,8);
 assert.equal((await post('alice',edited)).status,409);
 await post('alice',{action:'template',groupId:gid,occasion:'Party'});a=await get('bob',gid);assert.equal(a.data.items.length,14);
 await post('bob',{action:'editGroup',groupId:gid,name:'Friends camping',date:'2026-10-01',location:'Turkey Point'});a=await get('alice',gid);assert.equal(a.data.groups[0].name,'Friends camping');
});
