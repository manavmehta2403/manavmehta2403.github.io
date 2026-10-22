export const cities = ['Paris', 'Tokyo', 'Lisbon', 'Bali'];
const words = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7};
const number = s => Number(s) || words[s.toLowerCase()] || 0;
export function extract(text, pending) {
  const slots = {};
  const city = cities.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text));
  if (city) slots.destination = city;
  const nights = text.match(/(\d+|one|two|three|four|five|six|seven)\s+nights?/i);
  const people = text.match(/(?:for|with)\s+(\d+|one|two|three|four|five|six|seven)\s+(?:people|adults|travellers|of us)/i);
  if(nights) slots.nights = number(nights[1]);
  if(people) slots.travellers = number(people[1]);
  if(pending && pending !== 'destination' && /^(\d+|one|two|three|four|five|six|seven)$/i.test(text.trim())) slots[pending] = number(text.trim());
  return slots;
}
export function consensus(a,b) {
  const slots={}, conflicts=[];
  for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()) {
    if(k in a && k in b && a[k] !== b[k]) conflicts.push(k);
    else slots[k]=a[k] ?? b[k];
  }
  return {slots,conflicts};
}
export function applySlots(state, values, source='user') {
  const next = {...state, slots:{...state.slots}, provenance:{...state.provenance}};
  for(const [k,v] of Object.entries(values)) {
    if(source === 'inferred' && next.provenance[k] === 'user') continue;
    if(k==='destination' && !cities.includes(v)) throw new Error('Choose Paris, Tokyo, Lisbon or Bali.');
    if(k==='nights' && (!Number.isInteger(v)||v<1||v>30)) throw new Error('Nights must be between 1 and 30.');
    if(k==='travellers' && (!Number.isInteger(v)||v<1||v>12)) throw new Error('Travellers must be between 1 and 12.');
    next.slots[k]=v;next.provenance[k]=source;
  }
  next.stage=['destination','nights','travellers'].every(k=>next.slots[k])?'confirming':'collecting';
  return next;
}
export function newSession(tenant='atlas'){return {tenant,stage:'collecting',slots:{},provenance:{}};}
export const inventory = [
  {id:'a1',tenant:'atlas',destination:'Paris',name:'Riverside weekend',base_price:80,min_nights:2},
  {id:'a2',tenant:'atlas',destination:'Tokyo',name:'City lights',base_price:95,min_nights:2},
  {id:'a3',tenant:'atlas',destination:'Lisbon',name:'Coastal escape',base_price:65,min_nights:1},
  {id:'a4',tenant:'atlas',destination:'Bali',name:'Garden retreat',base_price:60,min_nights:3},
  {id:'b1',tenant:'northstar',destination:'Paris',name:'Art district stay',base_price:110,min_nights:2},
  {id:'b2',tenant:'northstar',destination:'Tokyo',name:'Skyline studio',base_price:120,min_nights:1},
  {id:'b3',tenant:'northstar',destination:'Lisbon',name:'Old town loft',base_price:90,min_nights:2},
  {id:'b4',tenant:'northstar',destination:'Bali',name:'Ocean hideaway',base_price:100,min_nights:3}
];
export function searchPackages(state, caller=state.tenant) {
  if(caller!==state.tenant) throw new Error('Tenant mismatch');
  if(state.stage!=='confirming'||!['destination','nights','travellers'].every(k=>state.slots[k])) throw new Error('Confirm a complete trip first');
  const markup=caller==='northstar'?0.1:0;
  return inventory.filter(p=>p.tenant===caller && p.destination.toLowerCase()===state.slots.destination.toLowerCase() && p.min_nights<=state.slots.nights).map(p=>({...p,total:Math.round(p.base_price*state.slots.nights*state.slots.travellers*(1+markup)*100)/100}));
}
export const normalize=s=>s.normalize('NFKD').replace(/[^\x00-\x7F]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
function distance(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
export function suggest(query, records, now, includeStale=false, limit=5){
  if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Limit must be 1–20');
  const q=normalize(query);if(q.length<2)return [];
  return records.filter(r=>r.available && now-r.observed_at>=0 && (includeStale||now-r.observed_at<300)).map(r=>{
    const text=normalize(`${r.name} ${r.city}`);const parts=[text,...text.split(' '),normalize(r.city)];
    const score=text.startsWith(q)?100:Math.max(...parts.map(p=>Math.round(100*(1-distance(q,p)/Math.max(q.length,p.length)))));
    return {...r,score,stale:now-r.observed_at>=300};
  }).filter(r=>r.score>=70).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}