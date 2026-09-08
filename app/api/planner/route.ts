import { database } from '@/db/raw';
import { templates } from '@/lib/templates';
type DB = ReturnType<typeof database>;
type GroupAccess = {id:string;owner_id:string;member_permission:string;visibility:string;password_hash:string|null};
class InputError extends Error { constructor(message:string,public status=400){super(message)} }
function identity(r:Request){const id=r.headers.get('oai-authenticated-user-id');if(!id)throw new InputError('Please sign in to use your planner.',401);let name=r.headers.get('oai-authenticated-user-full-name')||r.headers.get('oai-authenticated-user-email')?.split('@')[0]||'You';if(r.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')try{name=decodeURIComponent(name)}catch{}return {id,name};}
function str(v:unknown,max=120){if(typeof v!=='string')throw new InputError('Please check the form.');return v.trim().slice(0,max)}
const ownerSQL = "COALESCE(g.owner_id,(SELECT user_id FROM members WHERE group_id=g.id ORDER BY rowid LIMIT 1))";
async function membership(db:DB,gid:string,uid:string){if(!await db.prepare('SELECT 1 FROM members WHERE group_id=? AND user_id=?').bind(gid,uid).first())throw new InputError('This gathering is not available to you.',403)}
async function access(db:DB,gid:string,uid:string){await membership(db,gid,uid);const group=await db.prepare(`SELECT g.id,${ownerSQL} AS owner_id,g.member_permission,g.visibility,g.password_hash FROM gatherings g WHERE g.id=?`).bind(gid).first<GroupAccess>();if(!group)throw new InputError('Gathering not found.',404);return group;}
function requireEditor(group:GroupAccess,uid:string){if(group.owner_id!==uid&&group.member_permission!=='edit')throw new InputError('Only the admin can add, edit, or remove items. You can still update assignments and packing status.',403)}
function requireAdmin(group:GroupAccess,uid:string){if(group.owner_id!==uid)throw new InputError('Only the group admin can change these settings.',403)}
function passwordInput(v:unknown){if(typeof v!=='string'||v.length<8||v.length>128)throw new InputError('Use a password between 8 and 128 characters.');return v;}
function hex(bytes:ArrayBuffer|Uint8Array){return Array.from(new Uint8Array(bytes instanceof Uint8Array?bytes.buffer:bytes)).map(v=>v.toString(16).padStart(2,'0')).join('')}
async function derive(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:new TextEncoder().encode(salt)},key,256));}
async function hashPassword(password:string){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return salt+':'+await derive(password,salt);}
async function verifyPassword(password:string,stored:string){const [salt,expected]=stored.split(':');if(!salt||!expected)return false;const actual=await derive(password,salt);let diff=actual.length^expected.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);return diff===0;}
function settings(b:Record<string,unknown>){const permission=b.memberPermission??'edit',visibility=b.visibility??'public';if(!['edit','assign'].includes(String(permission))||!['public','protected'].includes(String(visibility)))throw new InputError('Choose valid group settings.');return {permission,visibility};}
async function assignment(db:DB,gid:string,value:unknown){const assignee=value?str(value):null;if(assignee&&assignee!=='everyone')await membership(db,gid,assignee);return assignee;}
function failure(e:unknown){if(e instanceof InputError)return Response.json({error:e.message},{status:e.status});console.error('Planner request failed',e);return Response.json({error:'Could not save or load your gathering. Please try again.'},{status:503})}
export async function GET(r:Request){try{
 const me=identity(r),db=database(),gid=new URL(r.url).searchParams.get('group');
 // Never serialize password hashes, including in the group overview.
 const groups=(await db.prepare(`SELECT g.id,g.name,g.occasion,g.date,g.location,g.code,g.created_at,${ownerSQL} AS ownerId,g.member_permission AS memberPermission,g.visibility,(SELECT COUNT(*) FROM members WHERE group_id=g.id) AS memberCount,(SELECT COUNT(*) FROM items WHERE group_id=g.id) AS itemCount,(SELECT COUNT(*) FROM items WHERE group_id=g.id AND assignee IS NOT NULL) AS assignedCount FROM gatherings g JOIN members m ON g.id=m.group_id WHERE m.user_id=? ORDER BY g.created_at DESC`).bind(me.id).all()).results;
 if(!gid)return Response.json({me,groups},{headers:{'Cache-Control':'no-store'}});
 await membership(db,gid,me.id);
 const [memberRows,itemRows,packingRows]=await Promise.all([db.prepare('SELECT user_id AS id,name FROM members WHERE group_id=? ORDER BY name').bind(gid).all(),db.prepare('SELECT * FROM items WHERE group_id=? ORDER BY created_at,id').bind(gid).all(),db.prepare('SELECT p.item_id,p.user_id FROM item_packing p JOIN items i ON i.id=p.item_id JOIN members m ON m.group_id=i.group_id AND m.user_id=p.user_id WHERE i.group_id=?').bind(gid).all()]);
 const items=itemRows.results.map((i:any)=>{const packedBy=packingRows.results.filter((p:any)=>p.item_id===i.id).map((p:any)=>p.user_id);return {...i,packedBy,myPacked:packedBy.includes(me.id),packed:i.assignee==='everyone'?(packedBy.length===memberRows.results.length?1:0):i.packed};});
 return Response.json({me,groups,members:memberRows.results,items},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e)}}
export async function POST(r:Request){try{
 if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)throw new InputError('Invalid request origin.',403);
 const me=identity(r),db=database(),b=await r.json();
 if(b.action==='create'){
  const name=str(b.name),occasion=str(b.occasion);if(!name||!Object.hasOwn(templates,occasion))throw new InputError('Choose a name and occasion.');
  const {permission,visibility}=settings(b),passwordHash=visibility==='protected'?await hashPassword(passwordInput(b.password)):null;
  const id=crypto.randomUUID(),code=crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),seed=b.prefill?templates[occasion]:[];
  await db.batch([db.prepare('INSERT INTO gatherings (id,name,occasion,date,location,code,created_at,owner_id,member_permission,visibility,password_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id,name,occasion,str(b.date||''),str(b.location||''),code,Date.now(),me.id,permission,visibility,passwordHash),db.prepare('INSERT INTO members (group_id,user_id,name) VALUES (?,?,?)').bind(id,me.id,me.name),...seed.map((i,n)=>db.prepare('INSERT INTO items (id,group_id,name,quantity,unit,category,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,i.name,i.quantity,i.unit,i.category,Date.now()+n))]);return Response.json({id});
 }
 if(b.action==='join'){
  const code=str(b.code).toUpperCase().replaceAll(' ','');const group=await db.prepare('SELECT id,visibility,password_hash FROM gatherings WHERE code=?').bind(code).first<GroupAccess>();if(!group)throw new InputError('No gathering found. Double-check your invite code.',404);
  if(await db.prepare('SELECT 1 FROM members WHERE group_id=? AND user_id=?').bind(group.id,me.id).first())return Response.json({id:group.id});
  if(group.visibility==='protected'){
   if(!b.password)throw new InputError('This group is password-protected. Enter its password to join.',403);
   if(typeof b.password!=='string'||b.password.length>128)throw new InputError('Incorrect group password.',403);
   const now=Date.now(),window=15*60*1000;
   const attempt=await db.prepare('INSERT INTO join_attempts (group_id,user_id,attempts,window_start) VALUES (?,?,1,?) ON CONFLICT(group_id,user_id) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start < ? THEN ? ELSE window_start END RETURNING attempts').bind(group.id,me.id,now,now-window,now-window,now).first<{attempts:number}>();
   if(!attempt||attempt.attempts>5)throw new InputError('Too many password attempts. Try again in 15 minutes.',429);
   if(!group.password_hash||!await verifyPassword(b.password,group.password_hash))throw new InputError('Incorrect group password.',403);
  }
  await db.batch([db.prepare('INSERT OR IGNORE INTO members (group_id,user_id,name) VALUES (?,?,?)').bind(group.id,me.id,me.name),db.prepare('DELETE FROM join_attempts WHERE group_id=? AND user_id=?').bind(group.id,me.id)]);return Response.json({id:group.id});
 }
 const gid=str(b.groupId),group=await access(db,gid,me.id);
 if(b.action==='saveItem'){
  requireEditor(group,me.id);
  const name=str(b.name),unit=str(b.unit,30),category=str(b.category),quantity=Number(b.quantity);if(!name||!unit||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!['Food','Drinks','Equipment','Essentials','Other'].includes(category))throw new InputError('Add a name, unit, category, and quantity above zero.');
  const assignee=await assignment(db,gid,b.assignee);
  if(b.id){const old=await db.prepare('SELECT assignee,quantity,unit FROM items WHERE id=? AND group_id=?').bind(str(b.id),gid).first<any>();if(!old)throw new InputError('This item was removed. Refresh your list.',409);const reset=old.assignee!==assignee||old.quantity!==quantity||old.unit!==unit;
   await db.batch([db.prepare('UPDATE items SET name=?,quantity=?,unit=?,category=?,assignee=?,note=?,packed=CASE WHEN ? THEN 0 ELSE packed END WHERE id=? AND group_id=?').bind(name,quantity,unit,category,assignee,str(b.note||'',500),reset?1:0,str(b.id),gid),...(reset?[db.prepare('DELETE FROM item_packing WHERE item_id=?').bind(str(b.id))]:[])]);
  }else await db.prepare('INSERT INTO items (id,group_id,name,quantity,unit,category,assignee,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gid,name,quantity,unit,category,assignee,str(b.note||'',500),Date.now()).run();
 }else if(b.action==='assign'){
  const id=str(b.id),assignee=await assignment(db,gid,b.assignee),old=await db.prepare('SELECT assignee FROM items WHERE id=? AND group_id=?').bind(id,gid).first<any>();if(!old)throw new InputError('This item was removed. Refresh your list.',409);
  if(old.assignee!==assignee)await db.batch([db.prepare('UPDATE items SET assignee=?,packed=0 WHERE id=? AND group_id=?').bind(assignee,id,gid),db.prepare('DELETE FROM item_packing WHERE item_id=?').bind(id)]);
 }else if(b.action==='deleteItem'){requireEditor(group,me.id);await db.prepare('DELETE FROM items WHERE id=? AND group_id=?').bind(str(b.id),gid).run();
 }else if(b.action==='packed'){
  const id=str(b.id),item=await db.prepare('SELECT assignee FROM items WHERE id=? AND group_id=?').bind(id,gid).first<{assignee:string|null}>();if(!item)throw new InputError('This item was removed. Refresh your list.',409);
  if(item.assignee==='everyone'){if(b.packed)await db.prepare('INSERT OR IGNORE INTO item_packing (item_id,user_id) VALUES (?,?)').bind(id,me.id).run();else await db.prepare('DELETE FROM item_packing WHERE item_id=? AND user_id=?').bind(id,me.id).run();}
  else await db.prepare('UPDATE items SET packed=? WHERE id=? AND group_id=? AND assignee IS NOT NULL').bind(b.packed?1:0,id,gid).run();
 }else if(b.action==='claim')await db.prepare('UPDATE items SET assignee=? WHERE id=? AND group_id=? AND assignee IS NULL').bind(me.id,str(b.id),gid).run();
 else if(b.action==='template'){requireEditor(group,me.id);const occasion=str(b.occasion);if(!Object.hasOwn(templates,occasion)||!templates[occasion].length)throw new InputError('Choose an occasion template.');await db.batch(templates[occasion].map((i,n)=>db.prepare('INSERT INTO items (id,group_id,name,quantity,unit,category,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),gid,i.name,i.quantity,i.unit,i.category,Date.now()+n)));
 }else if(b.action==='editGroup'){
  requireAdmin(group,me.id);const name=str(b.name);if(!name)throw new InputError('Give your gathering a name.');const {permission,visibility}=settings(b);let passwordHash=group.password_hash;
  if(visibility==='public')passwordHash=null;else if(b.password)passwordHash=await hashPassword(passwordInput(b.password));else if(!passwordHash)throw new InputError('Set a password for this protected group.');
  await db.prepare('UPDATE gatherings SET name=?,date=?,location=?,owner_id=?,member_permission=?,visibility=?,password_hash=? WHERE id=?').bind(name,str(b.date||''),str(b.location||''),group.owner_id,permission,visibility,passwordHash,gid).run();
 }else throw new InputError('Unknown action.');return Response.json({ok:true});
}catch(e){return failure(e)}}
