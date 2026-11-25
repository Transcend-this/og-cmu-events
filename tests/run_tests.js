// Runs the page's built-in tests, the nightly-refresh reader tests (on saved sample pages), and a check that
// the page shows refreshed data correctly. Ends with ALL PASSED or the number of failures.
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const R=require('../scripts/refresh.js');
let fail=0;const t=(name,fn)=>{let ok=false;try{ok=!!fn()}catch(e){console.log('   error:',e.message)}console.log((ok?'PASS ':'FAIL ')+name);if(!ok)fail++};

// ---- reader tests ----
const og=R.parseOgPage(fs.readFileSync(path.join(__dirname,'fixtures','og-sample.html'),'utf8'));
t('Oak Grove reader finds every row',()=>og.events.length===5);
t('Oak Grove reader finds the Next page, not Previous',()=>og.nextPage===3);
const mob=og.events[0];
t('Home game, date, time, team and location read correctly',()=>mob[0]==='2026-12-04'&&mob[1]==='19:00'&&mob[2]==='vs MOBERLY SR. HIGH'&&mob[5]==='Basketball · Boys varsity'&&mob[6]==='H'&&mob[7]==='Oak Grove High School (High School Main Gym)'&&mob[9].endsWith('/Event/aaa'));
t('Middle-school cheer is cheer at middle-school level',()=>og.events[1][3]==='cheer'&&og.events[1][4]==='ms'&&og.events[1][5]==='Cheer · Coed middle school');
t('TBD time stays blank and tournament note is kept',()=>og.events[3][1]===''&&og.events[3][2]==='at Winnetonka Tournament (tournament)'&&og.events[3][6]==='A');
t('All-day school event, repeated location shortened',()=>og.events[4][1]==='all'&&og.events[4][3]==='school'&&og.events[4][7]==='Elementary Cafeteria');
const merged=R.mergeDuplicates(og.events);
t('Same event at two places becomes one row naming both',()=>merged.length===4&&merged[1][7].includes('also listed at Oak Grove High School'));
t('Empty page gives no events and no next page',()=>{const r=R.parseOgPage('<html></html>');return r.events.length===0&&r.nextPage===null});
t('Time reading: 12 PM, 12 AM, All Day',()=>R.parseOgTime('12:15 PM CST')==='12:15'&&R.parseOgTime('12:05 AM CST')==='00:05'&&R.parseOgTime('All Day')==='all'&&R.parseOgTime('TBD')==='');
const cmu=R.parseIcs(fs.readFileSync(path.join(__dirname,'fixtures','cmu-sample.ics'),'utf8'),'CMU','x');
t('CMU feed: all-day event with location from description',()=>cmu[0][0]==='2027-04-08'&&cmu[0][1]==='all'&&cmu[0][7]==='Daytona Beach, Fla.'&&!cmu[0][2].startsWith('('));
t('CMU feed: UTC time converted to Central, away game marked',()=>cmu[1][0]==='2027-02-12'&&cmu[1][1]==='18:00'&&cmu[1][6]==='A'&&cmu[1][7]==='Marshall, Mo.');
t('Generic labels are sorted by what the event is',()=>{const a=R.teamFromLabel('Oak Grove High School','FFA Fall Awards Banquet'),b=R.teamFromLabel('Central Office','School Board Meeting'),c=R.teamFromLabel('Color Gaurd','Winter Guard Practice'),d=R.teamFromLabel('Band','MS Holiday Band Concert');
  return a.cat==='academic'&&a.team==='High school'&&b.cat==='school'&&b.level==='other'&&b.team==='District'&&c.cat==='arts'&&c.team==='Color guard'&&d.cat==='arts'&&d.level==='ms'});
t('Season label switches in July',()=>R.seasonFor(new Date('2026-11-24'))==='2026-27'&&R.seasonFor(new Date('2027-03-01'))==='2026-27'&&R.seasonFor(new Date('2027-08-01'))==='2027-28');

// ---- page tests ----
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const d=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/'});
setTimeout(()=>{const w=d.window,doc=w.document;
 for(const [n,ok] of (w.__tests||[])){console.log((ok?'PASS ':'FAIL ')+'built-in: '+n);if(!ok)fail++}
 if(!(w.__tests||[]).length){console.log('FAIL no built-in tests ran');fail++}
 t('Page applies refreshed data and says when it was updated',()=>{
   const ok=w.applyData({generated:'2026-11-25T10:17:00Z',through:'2027-01-08',events:merged.concat(cmu)});
   return ok&&/Updated November 25, 2026/.test(doc.querySelector('#asof').textContent)&&w.document.querySelectorAll('.ev').length>0});
 t('Page ignores an empty refresh file',()=>w.applyData({events:[]})===false);
 t('No undefined or NaN on the page',()=>!/undefined|NaN/.test(doc.body.innerHTML));
 if(fs.existsSync(path.join(__dirname,'..','data','events.json'))){const j=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','events.json'),'utf8'));
   t('data/events.json is well formed',()=>Array.isArray(j.events)&&j.events.length>0&&j.events.every(e=>/^\d{4}-\d{2}-\d{2}$/.test(e[0])&&['og','cmu'].includes(e[8])));}
 console.log(fail?`\n${fail} FAILED`:'\nALL PASSED');process.exit(fail?1:0)},600);
