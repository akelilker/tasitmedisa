/**
 * Lightweight synthetic vehicle render timing (no DOM, measures signature/filter costs).
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tj = fs.readFileSync(path.join(root, 'tasitlar.js'), 'utf8');

function median(a){const s=a.slice().sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function p95(a){const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1, Math.ceil(0.95*s.length)-1)];}
function timed(fn,warm,n){for(let i=0;i<warm;i++)fn();const t=[];for(let i=0;i<n;i++){const a=process.hrtime.bigint();fn();const b=process.hrtime.bigint();t.push(Number(b-a)/1e6);}return{median:median(t),p95:p95(t)};}

function makeVehicles(n){
  const out=[];
  for(let i=0;i<n;i++){
    out.push({
      id:'v'+i, version:i%7, plate:'34 ABC '+(100+i), brandModel:'MARKA MODEL UZUN METIN '+i,
      branchId:String(i%50), assignedUserId:String(i%150), tahsisKisi:'Kullanıcı Adı '+i,
      transmission:i%2?'otomatik':'manuel', satildiMi:i%17===0, guncelKm:1000*i, year:2010+(i%16)
    });
  }
  return out;
}

function filterSort(vehicles, q, branch, transmission){
  let list=vehicles.slice();
  if(branch==='__archive__') list=list.filter(v=>v.satildiMi===true);
  else {
    if(branch!=='all') list=list.filter(v=>String(v.branchId)===String(branch));
    list=list.filter(v=>v.satildiMi!==true);
  }
  if(q){const qq=q.toLowerCase(); list=list.filter(v=>String(v.plate).toLowerCase().includes(qq)||String(v.brandModel).toLowerCase().includes(qq));}
  if(transmission) list=list.filter(v=>v.transmission===transmission);
  list.sort((a,b)=>String(a.plate).localeCompare(String(b.plate),'tr'));
  return list;
}

function signature(revs, query, viewMode, branch){
  return ['v'+revs.v,'b'+revs.b,'u'+revs.u,viewMode,branch,query,'w640'].join('__');
}

const sizes=[25,75,150,300];
const report={measuredAt:new Date().toISOString(), sizes:{}};
for(const n of sizes){
  const vehicles=makeVehicles(n);
  const revs={v:1,b:1,u:1};
  let last='';
  const first=timed(()=>{const list=filterSort(vehicles,'','all',''); const sig=signature(revs,'','list','all'); last=sig; return list.length;},3,10);
  const unchanged=timed(()=>{const sig=signature(revs,'','list','all'); if(sig===last) return 0; filterSort(vehicles,'','all','');},3,10);
  const search=timed(()=>{filterSort(vehicles,'ABC','all','');},3,10);
  report.sizes[n]={firstListMs:first, unchangedSkipMs:unchanged, searchMs:search, listFitInSource:!/view-list \.list-cell\.list-brand/.test(tj.match(/function fitVehicleTextBoxes[\s\S]*?\n  \}/)[0])};
}
report.sourceHasRevisionSignature=tj.includes('getVehicleCollectionRevisions');
report.sourceListFitRemoved=!/fitVehicleTextBoxes[\s\S]{0,800}list-cell\.list-brand/.test(tj);
fs.writeFileSync(path.join(process.env.VEHICLE_ARTIFACT || path.join(root,'../tasitmedisa-recovery-r3-r4-20260718-053526/vehicle-render'), 'measure-report.json'), JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
