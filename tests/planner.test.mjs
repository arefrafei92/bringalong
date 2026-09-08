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
 assert.equal((await post('bob',{action:'editGroup',groupId:gid,name:'Blocked',date:'',location:''})).status,403);await post('alice',{action:'editGroup',groupId:gid,name:'Friends camping',date:'2026-10-01',location:'Turkey Point'});a=await get('alice',gid);assert.equal(a.data.groups[0].name,'Friends camping');
});


test('everyone assignment tracks each member and includes future joiners',async()=>{
 const {data:{id:gid}}=await post('owner',{action:'create',name:'Everyone trip',occasion:'Custom'});
 const code=(await get('owner',gid)).data.groups.find(g=>g.id===gid).code;
 await post('friend',{action:'join',code});
 await post('owner',{action:'saveItem',groupId:gid,name:'Water',quantity:2,unit:'L',category:'Drinks',assignee:'everyone'});
 let view=(await get('owner',gid)).data;const id=view.items[0].id;
 assert.equal(view.items[0].assignee,'everyone');assert.equal(view.items[0].packed,0);
 await post('owner',{action:'packed',groupId:gid,id,packed:true});
 view=(await get('owner',gid)).data;assert.equal(view.items[0].myPacked,true);assert.equal(view.items[0].packed,0);assert.deepEqual(view.items[0].packedBy,['owner']);
 assert.equal((await get('friend',gid)).data.items[0].myPacked,false);
 await post('friend',{action:'packed',groupId:gid,id,packed:true});assert.equal((await get('owner',gid)).data.items[0].packed,1);
 await post('late',{action:'join',code});assert.equal((await get('owner',gid)).data.items[0].packed,0);
 await post('owner',{action:'assign',groupId:gid,id,assignee:'owner'});
 view=(await get('owner',gid)).data;assert.deepEqual(view.items[0].packedBy,[]);assert.equal(view.items[0].packed,0);
});

test('admin-only editing is enforced for all mutation paths',async()=>{
 const {data:{id:gid}}=await post('admin',{action:'create',name:'Restricted',occasion:'Camping',prefill:true,memberPermission:'assign'});
 let view=(await get('admin',gid)).data;const code=view.groups.find(g=>g.id===gid).code,id=view.items[0].id;
 await post('member',{action:'join',code});
 for(const body of [{action:'saveItem',name:'Sneak',quantity:1,unit:'each',category:'Other'},{action:'saveItem',id,name:'Sneak edit',quantity:1,unit:'each',category:'Other'},{action:'deleteItem',id},{action:'template',occasion:'Party'},{action:'editGroup',name:'Sneak settings',memberPermission:'edit'}])assert.equal((await post('member',{...body,groupId:gid})).status,403);
 assert.equal((await post('member',{action:'assign',groupId:gid,id,assignee:'everyone'})).status,200);
 assert.equal((await post('member',{action:'packed',groupId:gid,id,packed:true})).status,200);
 assert.equal((await get('admin',gid)).data.items.find(i=>i.id===id).name,view.items.find(i=>i.id===id).name);
 await post('admin',{action:'editGroup',groupId:gid,name:'Open editing',memberPermission:'edit',visibility:'public'});
 assert.equal((await post('member',{action:'saveItem',groupId:gid,name:'Allowed',quantity:1,unit:'each',category:'Other'})).status,200);
});

test('password protection, hashing, rate limiting, and public access',async()=>{
 assert.equal((await post('host',{action:'create',name:'Weak',occasion:'Custom',visibility:'protected',password:'short'})).status,400);
 const {data:{id:gid}}=await post('host',{action:'create',name:'Private party',occasion:'Party',visibility:'protected',password:'secretpass12'});
 let view=(await get('host',gid)).data;const group=view.groups.find(g=>g.id===gid),code=group.code;
 assert.equal(group.visibility,'protected');assert.equal(group.ownerId,'host');assert.equal(JSON.stringify(view).includes('password_hash'),false);assert.equal(JSON.stringify(view).includes('secretpass12'),false);
 const hash=sqlite.prepare('SELECT password_hash FROM gatherings WHERE id=?').get(gid).password_hash;assert.notEqual(hash,'secretpass12');assert.ok(hash.includes(':'));
 assert.equal((await post('guest',{action:'join',code})).status,403);assert.equal((await get('guest',gid)).status,403);
 assert.equal((await post('guest',{action:'join',code,password:'wrong'})).status,403);
 assert.equal((await post('guest',{action:'join',code,password:'secretpass12'})).status,200);
 for(let n=0;n<5;n++)assert.equal((await post('attacker',{action:'join',code,password:'wrong'})).status,403);
 assert.equal((await post('attacker',{action:'join',code,password:'secretpass12'})).status,429);
 assert.equal((await post('host',{action:'editGroup',groupId:gid,name:'Same password',visibility:'protected',password:''})).status,200);
 assert.equal(sqlite.prepare('SELECT password_hash FROM gatherings WHERE id=?').get(gid).password_hash,hash);
 await post('host',{action:'editGroup',groupId:gid,name:'New password',visibility:'protected',password:'newsecret123'});
 assert.equal((await post('newguest',{action:'join',code,password:'secretpass12'})).status,403);
 assert.equal((await post('newguest',{action:'join',code,password:'newsecret123'})).status,200);
 assert.equal((await post('guest',{action:'join',code})).status,200);
 await post('host',{action:'editGroup',groupId:gid,name:'Now public',visibility:'public'});
 assert.equal(sqlite.prepare('SELECT password_hash FROM gatherings WHERE id=?').get(gid).password_hash,null);
 assert.equal((await post('publicguest',{action:'join',code})).status,200);
});

test('existing groups retain their original first member as admin',async()=>{
 sqlite.prepare('INSERT INTO gatherings (id,name,occasion,code,created_at) VALUES (?,?,?,?,?)').run('legacy','Legacy','Custom','LEGACY',1);
 sqlite.prepare('INSERT INTO members (group_id,user_id,name) VALUES (?,?,?)').run('legacy','first','First');
 sqlite.prepare('INSERT INTO members (group_id,user_id,name) VALUES (?,?,?)').run('legacy','second','Second');
 assert.equal((await get('first','legacy')).data.groups.find(g=>g.id==='legacy').ownerId,'first');
 assert.equal((await post('second',{action:'editGroup',groupId:'legacy',name:'No'})).status,403);
 assert.equal((await post('first',{action:'editGroup',groupId:'legacy',name:'Owned',memberPermission:'assign'})).status,200);
 assert.equal(sqlite.prepare('SELECT owner_id FROM gatherings WHERE id=?').get('legacy').owner_id,'first');
});

test('member icons persist across groups and only the signed-in profile changes',async()=>{
 const {data:{id:gid}}=await post('icon-owner',{action:'create',name:'Icon group',occasion:'Custom'});
 const code=(await get('icon-owner',gid)).data.groups.find(g=>g.id===gid).code;
 await post('icon-friend',{action:'join',code});
 assert.equal((await post(null,{action:'profile',avatarText:'X',color:'#123456'})).status,401);
 assert.equal((await post('icon-owner',{action:'profile',avatarText:'TOOLONG',color:'#123456'})).status,400);
 assert.equal((await post('icon-owner',{action:'profile',avatarText:'AR',color:'red'})).status,400);
 assert.equal((await post('icon-owner',{action:'profile',avatarText:'👨‍👩‍👧‍👦',color:'#ABCDEF',userId:'icon-friend'})).status,200);
 let view=(await get('icon-friend',gid)).data;
 assert.equal(view.members.find(m=>m.id==='icon-owner').avatarText,'👨‍👩‍👧‍👦');assert.equal(view.members.find(m=>m.id==='icon-owner').color,'#abcdef');
 assert.equal(view.members.find(m=>m.id==='icon-friend').avatarText,null);
 assert.equal((await get('icon-owner')).data.me.color,'#abcdef');
 assert.equal((await post('icon-owner',{action:'profile',avatarText:'AR',color:'#2563eb'})).status,200);
 const {data:{id:second}}=await post('icon-owner',{action:'create',name:'Other group',occasion:'Custom'});
 assert.equal((await get('icon-owner',second)).data.members[0].avatarText,'AR');
 assert.equal((await get('icon-owner',gid)).data.members.find(m=>m.id==='icon-owner').avatarText,'AR');
});

async function history(user,group,before){const base=request(user);const params=new URLSearchParams({activity:'1'});if(group)params.set('group',group);if(before)params.set('before',before);const r=await api.GET(new Request(base.url+'?'+params,{headers:base.headers}));return {status:r.status,data:await r.json()}}
test('activity captures exact mutations, preserves deletion history, and isolates memberships',async()=>{
 const user='audit-owner';const {data:{id:gid}}=await post(user,{action:'create',name:'Audit camp',occasion:'Custom',visibility:'protected',password:'never-log-this'});
 let view=(await get(user,gid)).data;
 await post('audit-friend',{action:'join',code:view.groups.find(g=>g.id===gid).code,password:'never-log-this'});
 await post('audit-friend',{action:'join',code:view.groups.find(g=>g.id===gid).code});
 await post(user,{action:'saveItem',groupId:gid,name:'Water',quantity:2,unit:'L',category:'Drinks'});
 let id=(await get(user,gid)).data.items[0].id;
 await post('audit-friend',{action:'claim',groupId:gid,id});
 const afterClaim=(await history(user,gid)).data.events.length;
 await post(user,{action:'claim',groupId:gid,id});assert.equal((await history(user,gid)).data.events.length,afterClaim);
 await post(user,{action:'packed',groupId:gid,id,packed:true});
 const afterCheck=(await history(user,gid)).data.events.length;
 await post(user,{action:'packed',groupId:gid,id,packed:true});assert.equal((await history(user,gid)).data.events.length,afterCheck);
 await post('audit-friend',{action:'packed',groupId:gid,id,packed:false});
 await post(user,{action:'editGroup',groupId:gid,name:'Renamed camp',visibility:'protected',password:'another-secret',memberPermission:'assign'});
 const beforeDenied=(await history(user,gid)).data.events.length;
 assert.equal((await post('audit-friend',{action:'deleteItem',groupId:gid,id})).status,403);
 assert.equal((await history(user,gid)).data.events.length,beforeDenied);
 await post(user,{action:'deleteItem',groupId:gid,id});
 const h=await history(user,gid);assert.equal(h.status,200);
 assert.equal(h.data.events.filter(e=>e.action==='member.join'&&e.actorId==='audit-friend').length,1);
 const deleted=h.data.events.find(e=>e.action==='item.delete');assert.equal(deleted.subject,'Water');assert.equal(deleted.details.before.assignedTo,'audit-friend');
 const renamed=h.data.events.find(e=>e.action==='group.update');assert.equal(renamed.details.before.name,'Audit camp');assert.equal(renamed.details.after.name,'Renamed camp');assert.equal(renamed.details.passwordChanged,1);
 assert.ok(!JSON.stringify(h.data).includes('never-log-this'));assert.ok(!JSON.stringify(h.data).includes('another-secret'));assert.ok(!JSON.stringify(h.data).includes('password_hash'));
 assert.equal((await history('outsider',gid)).status,403);assert.ok(!(await history('outsider')).data.events.some(e=>e.groupId===gid));
 await get(user);await get(user);assert.equal((await history(user)).data.events.filter(e=>e.action==='account.start').length,1);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM activity_context').get().n,0);
});
test('Everyone packing history and pagination remain complete',async()=>{
 const user='pagination-owner';const {data:{id:gid}}=await post(user,{action:'create',name:'History',occasion:'Custom'});
 await post(user,{action:'saveItem',groupId:gid,name:'Cup',quantity:1,unit:'each',category:'Other',assignee:'everyone'});
 const id=(await get(user,gid)).data.items[0].id;
 for(let n=0;n<44;n++)await post(user,{action:'packed',groupId:gid,id,packed:n%2===0});
 const first=(await history(user,gid)).data;assert.equal(first.events.length,40);assert.ok(first.nextCursor);
 const second=(await history(user,gid,first.nextCursor)).data;assert.equal(second.nextCursor,null);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,47);
 assert.equal([...first.events,...second.events].filter(e=>e.action==='packing.check').length,22);
 assert.equal([...first.events,...second.events].filter(e=>e.action==='packing.uncheck').length,22);
 assert.equal((await history(user,gid,'-1')).status,400);
});
test('a failed activity insert rolls back the associated item mutation',async()=>{
 const {data:{id:gid}}=await post('rollback-user',{action:'create',name:'Rollback',occasion:'Custom'});
 sqlite.exec("CREATE TRIGGER fail_activity BEFORE INSERT ON activity_events WHEN NEW.action='item.create' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;");
 const prior=console.error;console.error=()=>{};
 try{assert.equal((await post('rollback-user',{action:'saveItem',groupId:gid,name:'Must roll back',quantity:1,unit:'each',category:'Other'})).status,503)}finally{console.error=prior;sqlite.exec('DROP TRIGGER fail_activity')}
 assert.equal((await get('rollback-user',gid)).data.items.length,0);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM activity_context').get().n,0);
});

test('automatic removal is opt-in, admin-controlled, cancellable, and cascades on expiry',async()=>{
 const owner='expiry-owner',friend='expiry-friend';
 const {data:{id:gid}}=await post(owner,{action:'create',name:'Temporary camp',occasion:'Custom'});
 let v=(await get(owner,gid)).data;assert.equal(v.groups.find(g=>g.id===gid).removeAt,null);const code=v.groups.find(g=>g.id===gid).code;
 await post(friend,{action:'join',code});
 assert.equal((await post(owner,{action:'editGroup',groupId:gid,name:'Temporary camp',removeEnabled:true,removeAt:null})).status,400);
 assert.equal((await post(owner,{action:'editGroup',groupId:gid,name:'Temporary camp',removeAt:Date.now()-1})).status,400);
 const removeAt=Date.now()+86400000;
 assert.equal((await post(friend,{action:'editGroup',groupId:gid,name:'Temporary camp',removeAt})).status,403);
 await post(owner,{action:'editGroup',groupId:gid,name:'Temporary camp',removeAt});
 assert.equal((await get(owner,gid)).data.groups.find(g=>g.id===gid).removeAt,removeAt);
 await post(owner,{action:'editGroup',groupId:gid,name:'Temporary camp',removeAt:null});
 assert.equal((await get(owner,gid)).data.groups.find(g=>g.id===gid).removeAt,null);
 await post(owner,{action:'saveItem',groupId:gid,name:'Cup',quantity:1,unit:'each',category:'Other',assignee:'everyone'});
 const id=(await get(owner,gid)).data.items[0].id;
 await post(owner,{action:'packed',groupId:gid,id,packed:true});
 sqlite.prepare('UPDATE gatherings SET remove_at=? WHERE id=?').run(Date.now()-1000,gid);
 assert.equal((await get(owner,gid)).status,403);
 for(const [table,col,val] of [['gatherings','id',gid],['items','group_id',gid],['members','group_id',gid],['activity_events','group_id',gid],['item_packing','item_id',id]])assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${col}=?`).get(val).n,0);
 assert.equal((await post(friend,{action:'join',code})).status,404);
 for(const user of [owner,friend])assert.equal((await history(user)).data.events.filter(e=>e.action==='group.remove'&&e.subject==='Temporary camp').length,1);
 await get(owner);assert.equal((await history(owner)).data.events.filter(e=>e.action==='group.remove').length,1);
});
