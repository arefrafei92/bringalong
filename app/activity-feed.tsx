'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { History,RefreshCw } from 'lucide-react';
type Event={id:number;groupId:string|null;groupName:string|null;actorId:string;actorName:string;avatarText?:string;color?:string;action:string;subject:string;createdAt:number;details:{before?:Record<string,unknown>;after?:Record<string,unknown>;passwordChanged?:boolean;person?:string}};
const labels:Record<string,string>={removeAt:'Automatic removal',name:'Name',quantity:'Quantity',unit:'Unit',category:'Category',note:'Note',assignedTo:'Assigned to',packed:'Packed',date:'Date',location:'Location',member_permission:'Members can',visibility:'Access',icon:'Icon',color:'Color'};
const timeFormatter=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'});
function value(key:string,v:unknown){if(v===null||v===undefined||v==='')return 'None';if(key==='removeAt')return timeFormatter.format(new Date(Number(v)));if(key==='packed')return v?'Yes':'No';if(key==='member_permission')return v==='edit'?'Manage items':'Update assignments and packing';return String(v)}
function description(e:Event){const {before,after}=e.details;if(e.action==='item.update'&&before&&after){const changed=Object.keys(after).filter(k=>k!=='assignedTo'&&before[k]!==after[k]);if(changed.length===1&&changed[0]==='packed')return after.packed?'checked off':'unchecked';if(changed.length===1&&changed[0]==='assignee')return 'changed the assignment for';}return ({'group.remove':'automatically removed','account.start':'started using','profile.update':'updated their','group.create':'created','group.update':'updated','member.join':'joined the gathering','member.rename':'updated their name','item.create':'added','item.update':'updated','item.delete':'deleted','packing.check':'checked off their share of','packing.uncheck':'unchecked a share of'} as Record<string,string>)[e.action]||'updated'}
function changes(e:Event){const {before,after,passwordChanged,person}=e.details;const lines:string[]=[];
 if(before&&after){for(const key of Object.keys(after)){if(key==='assignee'||before[key]===after[key])continue;lines.push(`${labels[key]||key}: ${value(key,before[key])} → ${value(key,after[key])}`)}}
 else if(e.action.startsWith('item.')){const i=after||before||{};lines.push(`${i.quantity} ${i.unit} · ${i.category} · ${i.assignedTo}`);if(i.note)lines.push(String(i.note))}
 else if(after)for(const key of Object.keys(after))if(after[key])lines.push(`${labels[key]||key}: ${value(key,after[key])}`);
 if(passwordChanged)lines.push('Group password changed');if(person)lines.push(`Share belonging to ${person}`);return lines;
}
const colors=['#2563eb','#b45309','#7c3aed','#be185d','#047857','#b91c1c','#0e7490'];
async function fetchActivity(groupId?:string,before?:string){
 const params=new URLSearchParams({activity:'1'});
 if(groupId)params.set('group',groupId);
 if(before)params.set('before',before);
 const r=await fetch('/api/planner?'+params);
 if(!r.ok){
  let message='Could not load activity.';
  try{const data=await r.json();if(data?.error)message=String(data.error)}catch{}
  throw Error(message);
 }
 return r.json() as Promise<{events:Event[];nextCursor:string|null}>;
}
export default function ActivityFeed({groupId}:{groupId?:string}){
 const [events,setEvents]=useState<Event[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const requestId=useRef(0);
 const load=useCallback(async(before?:string,quiet=false)=>{
  const current=++requestId.current;
  if(!quiet)setBusy(true);
  try{
   const data=await fetchActivity(groupId,before);
   if(current!==requestId.current)return;
   setEvents(old=>before?[...old,...data.events.filter((e:Event)=>!old.some(o=>o.id===e.id))]:data.events);
   setCursor(data.nextCursor);
   setError('');
  }catch(e){
   if(current!==requestId.current)return;
   setError((e as Error).message);
  }finally{
   if(current===requestId.current)setBusy(false);
  }
 },[groupId]);
 useEffect(()=>{
  setEvents([]);
  setCursor(null);
  void load();
  return()=>{requestId.current++};
 },[load]);
 return <div className="activity-feed"><div className="activity-heading"><div><h2><History size={20}/>Activity</h2><p>Who changed what, and when.</p></div><button className="btn compact" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button></div><p className="activity-scope">History starts with this update. First use records when someone starts using Bringalong. Earlier changes aren’t available.</p>{error&&<p role="alert" className="form-error">{error} {error.toLowerCase().includes('sign in')?<Link className="btn compact" href="/">Continue with email</Link>:<button className="btn compact" onClick={()=>void load()}>Retry</button>}</p>}
 {!events.length?<p className="activity-empty" role="status">{busy?'Loading activity…':error?'':'No activity yet. Changes will appear here.'}</p>:<ol className="activity-timeline">{events.map(e=>{const color=e.color||colors[[...e.actorId].reduce((sum,c)=>sum+c.charCodeAt(0),0)%colors.length];return <li key={e.id}><span className="activity-avatar" style={{borderColor:color,backgroundColor:color+'18',color}} aria-hidden="true">{e.avatarText||e.actorName.slice(0,2).toUpperCase()}</span><div className="activity-body"><p><strong>{e.actorName}</strong> {description(e)}{!['member.join','member.rename'].includes(e.action)&&<> <strong>{e.subject}</strong></>}</p><div className="activity-meta">{!groupId&&e.groupName&&<span>{e.groupName} · </span>}<time dateTime={new Date(e.createdAt).toISOString()}>{timeFormatter.format(new Date(e.createdAt))} UTC</time>{!e.groupId&&<span> · Personal</span>}</div>{changes(e).length>0&&<ul className="activity-changes">{changes(e).map((line)=><li key={line}>{line}</li>)}</ul>}</div></li>})}</ol>}
 {cursor&&<button className="btn activity-more" disabled={busy} onClick={()=>void load(cursor)}>{busy?'Loading…':'Load older activity'}</button>}</div>
}
