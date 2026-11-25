// Loads index.html in a simulated browser, runs its built-in tests, and checks the page renders cleanly.
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const d=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/'});
setTimeout(()=>{const w=d.window,doc=w.document;let fail=0;
 for(const [n,ok] of (w.__tests||[])){console.log((ok?'PASS ':'FAIL ')+'built-in: '+n);if(!ok)fail++}
 if(!(w.__tests||[]).length){console.log('FAIL no built-in tests ran');fail++}
 const body=doc.body.innerHTML;if(/undefined|NaN/.test(body)){console.log('FAIL page shows undefined or NaN');fail++}else console.log('PASS no undefined or NaN on the page');
 console.log(fail?`\n${fail} FAILED`:'\nALL PASSED');process.exit(fail?1:0)},500);
