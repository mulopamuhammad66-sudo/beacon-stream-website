import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '../src/config.js';
import './style.css';
const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{flowType:'pkce',detectSessionInUrl:true,storageKey:'beacon-admin-auth'}});
const $=id=>document.getElementById(id);
const tell=text=>$('status').textContent=text;
let epoch=0, userEpoch=0, directory=[];
function clearUsers(){++userEpoch;directory=[];$('users').replaceChildren();$('usersStatus').textContent='';$('userSearch').value='';}
function renderUsers(){
 const term=$('userSearch').value.trim().toLowerCase();
 const shown=directory.filter(p=>(String(p.username||'')+' '+String(p.display_name||'')).toLowerCase().includes(term));
 $('users').replaceChildren();
 $('usersStatus').textContent=directory.length?`${shown.length} shown from ${directory.length} loaded profiles (up to 50 newest).`:'No profiles returned.';
 for(const profile of shown){
 const card=document.createElement('article');card.className='user-card';
 const h=document.createElement('h3');h.textContent=profile.display_name||profile.username||'Profile';
 const handle=document.createElement('p');handle.className='muted';handle.textContent='@'+(profile.username||'unknown');
 const bio=document.createElement('p');bio.textContent=profile.bio||'No bio yet.';
 const joined=document.createElement('p');joined.className='muted';const date=new Date(profile.created_at);joined.textContent='Joined '+(Number.isNaN(date.getTime())?'unknown date':date.toLocaleDateString());
 card.append(h,handle,bio,joined);$('users').append(card);
 }
}
async function loadUsers(n=epoch){
 const ticket=++userEpoch;$('usersStatus').textContent='Loading profiles…';
 try{
 const result=await db.rpc('beacon_admin_users',{p_search:''});
 if(n!==epoch||ticket!==userEpoch)return;
 if(result.error)throw result.error;
 if(!Array.isArray(result.data))throw Error('Unexpected directory response.');
 directory=result.data;renderUsers();
 }catch(e){if(n===epoch&&ticket===userEpoch){directory=[];$('users').replaceChildren();$('usersStatus').textContent='Could not load profiles: '+e.message;}}
}
async function load(){
 const n=++epoch;
 $('panel').hidden=true;$('reports').replaceChildren();clearUsers();
 for(const id of ['accountsTotal','videosTotal','pendingTotal'])$(id).textContent='—';
 $('overviewStatus').textContent='';
 const {data,error}=await db.auth.getSession();
 if(n!==epoch)return;
 if(error){tell(error.message);return;}
 const session=data.session;
 $('login').hidden=!!session;$('logout').hidden=!session;
 if(!session){tell('Sign in to continue.');return;}
 const check=await db.rpc('beacon_is_admin');
 if(n!==epoch)return;
 if(check.error||check.data!==true){tell(check.error?'Admin check failed: '+check.error.message:'This account has no administrator access.');return;}
 tell('Administrator access confirmed.');$('panel').hidden=false;
 void loadUsers(n);
 $('overviewStatus').textContent='Loading totals…';
 const overview=await db.rpc('beacon_admin_overview');
 if(n!==epoch)return;
 if(overview.error){$('overviewStatus').textContent='Totals unavailable: '+overview.error.message;}
 else if(overview.data){
 for(const [id,key] of [['accountsTotal','accounts'],['videosTotal','videos'],['pendingTotal','pending_reports']]){
 const value=overview.data[key];$(id).textContent=typeof value==='number'?value.toLocaleString():'—';
 }
 $('overviewStatus').textContent='Updated '+new Date().toLocaleTimeString();
 }
 const result=await db.from('reports').select('id,reason,status,created_at').order('created_at',{ascending:false}).limit(100);
 if(n!==epoch)return;
 if(result.error){tell('Could not load reports: '+result.error.message);return;}
 $('count').textContent=result.data.length?`Showing ${result.data.length} most recent reports.`:'No reports yet.';
 for(const report of result.data){
 const card=document.createElement('article');
 for(const [label,value] of [['Status',report.status],['Reason',report.reason],['Submitted',new Date(report.created_at).toLocaleString()]]){
 const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+': ';p.append(b,document.createTextNode(value??''));card.append(p);
 }
 const select=document.createElement('select');select.setAttribute('aria-label','Report status');
 for(const value of ['pending','reviewed','dismissed']){const option=document.createElement('option');option.value=value;option.textContent=value;option.selected=value===report.status;select.append(option);}
 const save=document.createElement('button');save.textContent='Save status';
 save.onclick=async()=>{save.disabled=true;try{const r=await db.from('reports').update({status:select.value}).eq('id',report.id).select('id');if(r.error)throw r.error;if(r.data.length!==1)throw Error('No report updated. Check administrator access.');tell('Report status saved. This does not remove the video.');}catch(e){tell(e.message);}finally{save.disabled=false;}};
 card.append(select,save);$('reports').append(card);
 }
}
$('google').onclick=async()=>{const redirectTo=new URL('./',location.href);redirectTo.search='';redirectTo.hash='';const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo.href,queryParams:{prompt:'select_account'}}});if(error)tell(error.message);};
$('logout').onclick=async()=>{++epoch;$('panel').hidden=true;$('reports').replaceChildren();clearUsers();const {error}=await db.auth.signOut();if(error)tell(error.message);else await load();};
$('refresh').onclick=load;
$('userSearch').oninput=renderUsers;
$('usersRefresh').onclick=()=>loadUsers();
db.auth.onAuthStateChange(()=>{setTimeout(()=>load().catch(e=>tell(e.message)),0);});
load().catch(e=>tell(e.message));
