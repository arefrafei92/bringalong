import Link from 'next/link';
import { ArrowLeft,Package,ExternalLink } from 'lucide-react';
import ActivityFeed from '../activity-feed';
export default function ActivityPage(){return <div className="app"><header className="topbar"><Link href="/" className="brand"><span className="brandmark"><Package size={23}/></span>bringalong<span className="brand-dot">.</span></Link><Link className="btn compact" href="/"><ArrowLeft size={16}/>Gatherings</Link></header><main className="activity-page"><section className="list-panel"><ActivityFeed/></section></main><footer className="activity-footer"><a className="github-link" href="https://github.com/arefrafei92/bringalong" target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/>GitHub</a></footer></div>}
