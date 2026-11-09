// HomeHub smoke test. Run from the repo root:  npm i -D playwright && npx playwright install chromium && node tests/smoke.js
// It fakes a signed-in session, blocks the network (so the app runs offline) and mocks the AI endpoint.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d)})}).listen(8765);
const mk=(id,n,role)=>({id,name:n,role,color:0,status:'home',vis:'everyone',image:'',prefs:{tasks:true,routines:true,reminders:true},joined:Date.now()});
const state={v:1,household:{id:'h1',name:'Test Home',type:'family',image:'',modules:{tasks:true,routines:true,inventory:true,bills:true,events:true,cleaning:true,meals:true,suggestions:true,announcements:true},currency:'ZMW',autoAdd:true,created:Date.now()},
 members:[mk('m1','Mutale','admin'),mk('m2','Chanda','member'),mk('m3','Zed','restricted')],me:null,invites:[],tasks:[],routines:[],runs:{},notifs:[],activity:[],inventory:[],groceries:[],bills:[],jars:[],events:[],cleaning:[],maint:[],meals:[],suggestions:[],announcements:[],sample:false,chat:[],feed:[],acts:[],rules:[],devices:[],p5:{home:null,consent:{},prev:{},ctx:null},directory:[]};
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
(async()=>{
 const b=await chromium.launch();
 async function open(me,lang,online=true){
  const ctx=await b.newContext({viewport:{width:1200,height:900},locale:lang||'en-US'});
  await ctx.route(/supabase\.co|fonts\.g/,r=>r.abort());
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.addInitScript(([st,me])=>{if(!localStorage.getItem('homehub.auth')){localStorage.setItem('homehub.auth',JSON.stringify({access_token:'x',refresh_token:'y',expires_at:9999999999,uid:'u1'}));
   localStorage.setItem('homehub.cache.u1',JSON.stringify({hid:'h1',mid:me,ver:1,base:null,state:st,dirty:false}))}},[state,me]);
  await pg.goto('http://localhost:8765/');await pg.waitForTimeout(400);return {pg,errs,ctx}}
 // ---- admin
 let {pg,errs}=await open('m1');
 ok(await pg.locator('.rail-link:has-text("Directory")').count()>0,'Directory in nav');
 await pg.click('.rail-link:has-text("Directory")');
 ok((await pg.textContent('#view')).includes('No contacts yet'),'empty state');
 await pg.click('[data-act=dir-new]');
 await pg.fill('#d-name','Banda Plumbing');await pg.selectOption('#d-cat','maintenance');await pg.fill('#d-phone','0977 123 456');await pg.fill('#d-web','bandaplumbing.co.zm');await pg.fill('#d-hours','Mon-Sat 8-17');
 await pg.click('form[data-form=dir] button[type=submit]');await pg.waitForTimeout(200);
 ok((await pg.textContent('#view')).includes('Banda Plumbing'),'contact added');
 ok(await pg.locator('a[href="tel:0977123456"]').count()>0,'tel link sanitised');
 ok(await pg.locator('a[href="https://bandaplumbing.co.zm"]').count()>0,'website normalised');
 // bad inputs
 await pg.click('[data-act=dir-new]');await pg.fill('#d-name','X');await pg.fill('#d-phone','abc');await pg.click('form[data-form=dir] button[type=submit]');
 ok((await pg.textContent('#form-err')).includes('phone'),'bad phone rejected');
 await pg.fill('#d-phone','');await pg.fill('#d-web','javascript:alert(1)');await pg.click('form[data-form=dir] button[type=submit]');await pg.waitForTimeout(150);
 ok(await pg.locator('a[href^="javascript"]').count()===0,'javascript: url not linked');
 // private contact
 await pg.click('[data-act=dir-new]');await pg.fill('#d-name','Secret Dentist');await pg.check('input[name=scope][value=private]');await pg.click('form[data-form=dir] button[type=submit]');await pg.waitForTimeout(150);
 ok((await pg.evaluate(()=>JSON.parse(localStorage.getItem('homehub.cache.u1')).state.directory.map(d=>d.name))).join()==='Banda Plumbing,X','private contact not in synced state');
 // search
 await pg.fill('#dq','plumb');ok((await pg.textContent('#dir-list')).includes('Banda')&&!(await pg.textContent('#dir-list')).includes('Secret'),'search filters');
 await pg.fill('#dq','');
 // ---- chat local intents
 await pg.click('.rail-link:has-text("Chat")');
 const say=async t=>{await pg.fill('#p4in',t);await pg.press('#p4in','Enter');await pg.waitForTimeout(250);return (await pg.locator('.msg').last().textContent())};
 let r=await say("@HomeHub, what's our plumber's number?");ok(r.includes('0977 123 456'),'plumber lookup: '+r.slice(0,80));
 ok(await pg.locator('.msg').last().locator('a[href^="tel:"]').count()>0,'lookup renders tap-to-call');
 r=await say('@HomeHub, add this number as our electrician 0966 555 444');ok(/What name/.test(r),'role-only asks for name: '+r.slice(0,100));
 r=await say('@HomeHub add 0966 555 444 as our electrician');ok(/What name/.test(r),'asks for name: '+r.slice(0,100));
 r=await say('Joe Electrics');ok(/Saved Joe Electrics/.test(r),'name follow-up saves: '+r.slice(0,100));
 ok(await pg.evaluate(()=>JSON.parse(localStorage.getItem('homehub.cache.u1')).state.directory.some(d=>d.name==='Joe Electrics'&&d.cat==='maintenance'&&d.phone==='0966 555 444')),'electrician saved to Maintenance');
 r=await say('@HomeHub who is our landlord');ok(/couldn.t find a saved landlord/.test(r),'missing role handled');
 r=await say('@HomeHub add milk and eggs to the shopping list');ok(/added/i.test(r),'shopping still works');
 r=await say("@HomeHub what's on the shopping list");ok(/Milk/.test(r),'list read: '+r.slice(0,60));
 r=await say('@HomeHub the kitchen sink is leaking badly');
 // hint (non-@) message
 await pg.fill('#p4in','The pipe under the sink is leaking again');await pg.press('#p4in','Enter');await pg.waitForTimeout(250);
 ok((await pg.locator('.msg').last().textContent()).includes('Saved contacts that may help'),'leak triggers plumber hint');
 // defer: unknown goes where? AI unavailable offline -> fallback message
 r=await say('@HomeHub plan something fun for the weekend');ok(/I can add shopping items/.test(r),'unknown falls back offline');
 ok(await pg.evaluate(()=>!JSON.stringify(JSON.parse(localStorage.getItem('homehub.cache.u1')).state.directory).includes('Dentist')),'no leak of private');
 // currency
 await pg.click('.rail-link:has-text("Money")');await pg.click('[data-act=new-bill]');
 ok(await pg.locator('#b-cur option').count()>40,'many currencies: '+await pg.locator('#b-cur option').count());
 ok(await pg.inputValue('#b-cur')==='ZMW','default ZMW');
 await pg.fill('#b-name','Rent');await pg.fill('#b-amt','500');await pg.selectOption('#b-cur','USD');await pg.click('form[data-form=bill] button[type=submit]');await pg.waitForTimeout(200);
 await pg.click('[data-act=new-bill]');await pg.fill('#b-name','Water');await pg.fill('#b-amt','250');await pg.click('form[data-form=bill] button[type=submit]');await pg.waitForTimeout(200);
 const view=await pg.textContent('#view');ok(/US\$500|\$500/.test(view)&&/ZMW\s?250/.test(view),'bills show own currency: '+view.replace(/\s+/g,' ').slice(0,200));
 r=await (async()=>{await pg.click('.rail-link:has-text("Chat")');return say('@HomeHub what bills are unpaid')})();ok(/Rent/.test(r)&&/Water/.test(r),'bills intent');
 // language
 await pg.click('[data-act=account]');await pg.selectOption('#lang-sel','fr');await pg.waitForTimeout(250);
 await pg.keyboard.press('Escape');
 const nav=await pg.textContent('.rail-nav');ok(/Accueil/.test(nav)&&/Répertoire/.test(nav)&&/Argent/.test(nav),'French nav: '+nav.slice(0,80));
 ok(await pg.evaluate(()=>document.documentElement.lang)==='fr','html lang');
 await pg.click('.rail-link:has-text("Répertoire")');ok((await pg.textContent('#view')).includes('Ajouter un contact'),'directory translated');
 await pg.click('.rail-link:has-text("Argent")');ok((await pg.textContent('#view')).includes('Impayées'),'money translated');
 await pg.screenshot({path:require('os').tmpdir()+'/homehub-fr.png'});
 console.log('page errors:',errs.length?errs:'none');if(errs.length)fails++;

 // ---- AI gating
 {let calls=0,mode='ok';const c3=await open('m1');
  await c3.ctx.route(/functions\/v1\/homehub-ai/,r=>{calls++;if(mode==='429')return r.fulfill({status:429,contentType:'application/json',body:'{"error":"busy"}'});r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({reply:'AI says hi',actions:[]})})});
  await c3.pg.click('.rail-link:has-text("Chat")');
  const s3=async t=>{await c3.pg.fill('#p4in',t);await c3.pg.press('#p4in','Enter');await c3.pg.waitForTimeout(500);return (await c3.pg.locator('.msg').last().textContent())};
  await s3('@HomeHub add milk to the shopping list');ok(calls===0,'simple request uses no AI');
  await s3('@HomeHub what is on my plate today');ok(calls===0,'simple question uses no AI');
  let r3=await s3('@HomeHub plan a surprise for mum this weekend');ok(calls===1&&/AI says hi/.test(r3),'complex request goes to AI online: calls='+calls);
  await c3.ctx.setOffline(true);await c3.pg.waitForTimeout(200);
  r3=await s3('@HomeHub plan a surprise for dad');ok(calls===1&&/I can add shopping items|basic/.test(r3),'offline skips AI');
  await c3.ctx.setOffline(false);await c3.pg.waitForTimeout(200);mode='429';
  r3=await s3('@HomeHub another complicated thing please');ok(calls===2,'429 attempt made: '+calls);
  r3=await s3('@HomeHub yet another complicated thing');ok(calls===2,'cool-down after 429 skips AI: '+calls);
  r3=await s3('@HomeHub add eggs to the shopping list');ok(/added|already/.test(r3),'local still works during cool-down');
  console.log('ai errors:',c3.errs.length?c3.errs:'none');}
 // ---- smart inventory input
 {const c=await open('m1'),p=c.pg;let rcalls=0,offcalls=0,lastBody=null;
  const J=(r,o)=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  await c.ctx.route(/functions\/v1\/homehub-ai/,r=>{rcalls++;lastBody=JSON.parse(r.request().postData());J(r,{receipt:{store:'Shoprite',date:'2026-11-08',currency:'ZMW',total:130,items:[{name:'Cooking oil 2L',qty:1,unit:'L',price:90,cat:'Pantry'},{name:'Bread',qty:2,unit:'pcs',price:40,cat:'Fresh'},{name:'<img src=x onerror=window.__xss=1>',qty:1,unit:'pcs',price:5,cat:'Other'}]}})});
  await c.ctx.route(/openfoodfacts\.org/,r=>{offcalls++;J(r,/6001000000017/.test(r.request().url())?{status:1,product:{product_name:'Peanut Butter',brands:'Yum',quantity:'400 g',categories_tags:['en:spreads']}}:{status:0})});
  const inv=async()=>{await p.click('.rail-link:has-text("Supplies")');await p.click('[data-act=sup-tab][data-t=inv]');await p.waitForTimeout(100)};
  const rowQty=async n=>{const t=await p.locator('#inv-list li',{hasText:n}).first().locator('.qty').textContent().catch(()=>null);return t};
  await inv();
  ok(await p.locator('[data-act=si-scan]').count()===1&&await p.locator('[data-act=si-receipt]').count()===1,'SI: scan buttons shown to admin');
  // manual entry with price
  await p.click('[data-act=new-inv]');await p.fill('#i-name','Rice');await p.fill('#i-qty','2');await p.selectOption('#i-unit','kg');await p.fill('#i-min','1');await p.fill('#i-price','55');
  await p.click('form[data-form=inv] button[type=submit]');await p.waitForTimeout(150);
  await p.click('[data-act=open-inv]');ok((await p.textContent('#modal-root')).includes('Last price paid'),'SI: manual price saved and shown');await p.keyboard.press('Escape');
  // typed receipt, matches Rice, adds Salt
  await p.click('[data-act=si-receipt]');await p.fill('#si-txt','2 x Rice 1kg   60.00\nSalt\nTotal 70.00');await p.click('form[data-form=si-text] button[type=submit]');await p.waitForTimeout(100);
  ok(await p.locator('.si-row').count()===2,'SI: typed receipt gives 2 rows, totals skipped');
  ok((await p.locator('select[name=m0]').inputValue())!=='','SI: Rice line matched to existing item');
  await p.fill('input[name=n1]','Salt');
  await p.click('form[data-form=si-review] button[type=submit]');await p.waitForTimeout(150);
  ok((await rowQty('Rice'))==='4kg','SI: matched item stock topped up (got '+(await rowQty('Rice'))+')');
  ok(await p.locator('#inv-list li',{hasText:'Salt'}).count()===1,'SI: new item created from receipt');
  // barcode: OFF lookup, save, rescan from memory, use it
  await p.click('[data-act=si-scan]');await p.fill('#si-code','6001000000017');await p.click('form[data-form=si-code] button[type=submit]');await p.waitForTimeout(250);
  ok((await p.inputValue('input[name=n0]'))==='Yum Peanut Butter 400 g'&&offcalls===1,'SI: barcode looked up online');
  await p.click('form[data-form=si-review] button[type=submit]');await p.waitForTimeout(150);
  ok(await p.locator('#inv-list li',{hasText:'Peanut Butter'}).count()===1,'SI: barcode item saved');
  await p.click('[data-act=si-scan]');await p.fill('#si-code','6001000000017');await p.click('form[data-form=si-code] button[type=submit]');await p.waitForTimeout(250);
  ok(offcalls===1&&(await p.locator('select[name=m0]').inputValue())!=='','SI: rescan uses household memory and matches item');
  await p.selectOption('#si-mode','used');await p.click('form[data-form=si-review] button[type=submit]');await p.waitForTimeout(150);
  ok((await rowQty('Peanut Butter'))==='0pcs','SI: barcode "used" reduces stock');
  // unknown barcode: name it once, remembered
  await p.click('[data-act=si-scan]');await p.fill('#si-code','6009999999999');await p.click('form[data-form=si-code] button[type=submit]');await p.waitForTimeout(250);
  ok((await p.textContent('#modal-root')).includes('not found')&&(await p.inputValue('input[name=n0]'))==='','SI: unknown barcode asks for a name');
  await p.click('form[data-form=si-review] button[type=submit]');ok((await p.textContent('#form-err')).includes('name'),'SI: blank name rejected');
  await p.fill('input[name=n0]','Local Honey');await p.click('form[data-form=si-review] button[type=submit]');await p.waitForTimeout(150);
  await p.click('[data-act=si-scan]');await p.fill('#si-code','6009999999999');await p.click('form[data-form=si-code] button[type=submit]');await p.waitForTimeout(250);
  ok((await p.inputValue('input[name=n0]'))==='Local Honey'&&offcalls===2,'SI: taught barcode remembered');await p.keyboard.press('Escape');
  ok(await p.locator('#modal-root .sheet').count()===0,'SI: modal closed cleanly');
  // bad barcode input
  await p.click('[data-act=si-scan]');await p.fill('#si-code','12ab');await p.click('form[data-form=si-code] button[type=submit]');ok((await p.textContent('#form-err')).includes('digits'),'SI: bad barcode rejected');await p.keyboard.press('Escape');
  // receipt photo via AI, groceries ticked off, hostile text stays inert
  await p.click('.rail-link:has-text("Supplies")');await p.click('[data-act=sup-tab][data-t=shop]');await p.click('[data-act=new-groc]');await p.fill('#g-name','Bread');await p.click('form[data-form=grocery] button[type=submit]');await p.waitForTimeout(100);
  ok((await p.textContent('#view')).includes('Bread'),'SI: grocery "Bread" on the list');
  await inv();await p.click('[data-act=si-receipt]');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  await p.setInputFiles('#si-rup',{name:'r.png',mimeType:'image/png',buffer:png});await p.waitForTimeout(700);
  ok(rcalls===1&&lastBody&&lastBody.mode==='receipt'&&lastBody.image.length>20&&lastBody.mime==='image/jpeg','SI: receipt photo sent to AI function');
  ok(await p.locator('.si-row').count()===3&&(await p.textContent('#modal-root')).includes('Shoprite'),'SI: AI items shown for review');
  ok(await p.evaluate(()=>window.__xss===undefined),'SI: hostile receipt text is inert');
  await p.click('form[data-form=si-review] button[type=submit]');await p.waitForTimeout(150);
  ok(await p.locator('#inv-list li',{hasText:'Bread'}).count()===1,'SI: receipt items saved');
  await p.click('[data-act=sup-tab][data-t=shop]');{const v=await p.textContent('#view');ok(!v.includes('Bread')&&v.includes('Peanut Butter'),'SI: bought grocery ticked off by receipt (and low-stock auto item stays)')}
  // offline: photo path explains, typed path still works
  await inv();await c.ctx.setOffline(true);await p.click('[data-act=si-receipt]');await p.setInputFiles('#si-rup',{name:'r.png',mimeType:'image/png',buffer:png});await p.waitForTimeout(300);
  ok((await p.textContent('#modal-root')).includes('offline')&&rcalls===1,'SI: offline receipt photo explained, no call');
  await p.fill('#si-txt','Matches');await p.click('form[data-form=si-text] button[type=submit]');await p.waitForTimeout(100);
  ok(await p.locator('.si-row').count()===1,'SI: typed receipt works offline');await p.keyboard.press('Escape');await c.ctx.setOffline(false);
  console.log('si errors:',c.errs.length?c.errs:'none');ok(c.errs.length===0,'SI: no page errors')}
 // ---- restricted user
 let c2=await open('m3');
 ok(await c2.pg.locator('.rail-link:has-text("Directory")').count()>0,'restricted sees directory');
 await c2.pg.click('.rail-link:has-text("Directory")');await c2.pg.click('[data-act=dir-new]');
 ok(await c2.pg.locator('input[name=scope][value=shared]').count()===0,'restricted cannot create shared');
 await c2.pg.evaluate(()=>document.querySelector('[data-act=go][data-view=supplies]').click());await c2.pg.waitForTimeout(150);
 ok((await c2.pg.textContent('#view')).includes('Shopping')||(await c2.pg.textContent('#view')).includes('to buy'),'restricted reaches supplies');
 ok(await c2.pg.locator('[data-act=sup-tab][data-t=inv]').count()===0&&await c2.pg.locator('[data-act=si-scan],[data-act=si-receipt]').count()===0,'SI: restricted user has no inventory tab or scan buttons');
 console.log('restricted errors:',c2.errs.length?c2.errs:'none');
 await b.close();srv.close();console.log(fails?('FAILS: '+fails):'ALL PASSED');process.exit(fails?1:0)})();
