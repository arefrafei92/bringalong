import { ArrowLeft,Package } from 'lucide-react';
import ActivityFeed from '../activity-feed';
export default function ActivityPage(){return <div className="app"><header className="topbar"><a href="/" className="brand"><span className="brandmark"><Package size={23}/></span>bringalong<span className="brand-dot">.</span></a><a className="btn compact" href="/"><ArrowLeft size={16}/>Gatherings</a></header><main className="activity-page"><section className="list-panel"><ActivityFeed/></section></main></div>}
