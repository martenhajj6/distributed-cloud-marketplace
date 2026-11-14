const path=require('path'),fs=require('fs'),assert=require('assert/strict');
const original=path.resolve(__dirname,'..');
if(process.env.FINANCE_TEST_MODULES){process.env.NODE_PATH=process.env.FINANCE_TEST_MODULES;require('module').Module._initPaths();}
require('dotenv').config({path:process.env.FINANCE_TEST_ENV||path.join(original,'.env'),quiet:true});

process.env.SESSION_SECRET='isolated-finance-regression-session-secret';
let db, database;
const results=[];const sessions={};let base,admin,server,seq=0;
async function req(method,url,body,cookie=admin,headers={}){
 const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
async function test(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
async function fixture(amount=100){
 const [p]=await db.execute("INSERT INTO billing_periods(customer_id,period_start,period_end) VALUES (2,?,?)",[`${2050+seq}-01-01`,`${2050+seq++}-02-01`]);
 const [i]=await db.execute("INSERT INTO invoices(invoice_number,billing_period_id,subtotal,total,status) VALUES (?,?,?,?,'Paid')",['TEST-'+Date.now()+'-'+seq,p.insertId,amount,amount]);
 const [pay]=await db.execute("INSERT INTO payments(payment_reference,invoice_id,amount) VALUES (?,?,?)",['PAY-TEST-'+Date.now()+'-'+seq,i.insertId,amount]);
 await db.execute('INSERT INTO provider_earnings(payment_id,provider_id,gross_amount,commission_rate,commission_amount,net_amount) VALUES (?,3,?,15,?,?)',[pay.insertId,amount,Math.round(amount*15)/100,Math.round(amount*85)/100]);
 return pay.insertId;
}
async function withdrawal(amount=10){const [r]=await db.execute('INSERT INTO withdrawal_requests(provider_id,amount) VALUES (3,?)',[amount]);return r.insertId;}
async function run(){
 database=await require('./setup-finance.cjs')();
 process.env.DB_NAME=database;
 db=require('../backend/DAL/dbconn');
 const sql=fs.readFileSync(path.join(original,'database/cloud_marketplace.sql'),'utf8');
 for(const name of ['EmailVerificationTokens','UserTwoFactor']){const m=[...sql.matchAll(/CREATE TABLE (\w+)\s*\([\s\S]*?ENGINE=InnoDB;/g)].find(m=>m[1]===name);await db.query(m[0].replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'));}
 server=require('../server').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@finance.test',password:'FinanceTest123!'})});
 assert.equal(login.status,200,'admin login setup');admin=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 for(const url of ['/payments','/refunds','/earnings','/withdrawals','/dashboard'])await test('admin GET '+url,async()=>assert.equal((await req('GET','/api/finance'+url)).status,200));
 await test('unauthenticated finance denied',async()=>assert.equal((await req('GET','/api/finance/dashboard',undefined,'')).status,401));
 for(const filter of [['payments','invoice_id'],['refunds','payment_id'],['earnings','provider_id'],['withdrawals','provider_id']])for(const value of ['-1','0','abc','1.5','9007199254740992','%27%20OR%201=1',''])await test('invalid filter '+filter.join('/')+'='+value,async()=>assert.equal((await req('GET',`/api/finance/${filter[0]}?${filter[1]}=${value}`)).status,400));
 for(const amount of [-1,0,null,true,{},[],1e100])await test('invalid refund amount '+JSON.stringify(amount),async()=>assert.equal((await req('POST','/api/finance/refunds',{payment_id:999999,amount})).status,400));
 await test('missing payment returns 404',async()=>assert.equal((await req('POST','/api/finance/refunds',{payment_id:999999,amount:1})).status,404));
 await test('partial then full refund reconciles',async()=>{
  const id=await fixture();let a=await req('POST','/api/finance/refunds',{payment_id:id,amount:25});assert.equal(a.status,201);assert.equal(a.body.remaining_refundable,75);assert.equal(a.body.provider_adjustments[0].net_reduction,21.25);
  a=await req('POST','/api/finance/refunds',{payment_id:id,amount:75});assert.equal(a.status,201);
  const [[e]]=await db.execute('SELECT gross_amount,commission_amount,net_amount FROM provider_earnings WHERE payment_id=?',[id]);assert.deepEqual(e,{gross_amount:0,commission_amount:0,net_amount:0});
  assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1})).status,409);
 });
 await test('over-refund rejected without writes',async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:101})).status,400);const [[r]]=await db.execute('SELECT COUNT(*) AS n FROM refunds WHERE payment_id=?',[id]);assert.equal(r.n,0);});
 await test('concurrent refunds never exceed payment',async()=>{const id=await fixture();const a=await Promise.all(Array.from({length:8},()=>req('POST','/api/finance/refunds',{payment_id:id,amount:30})));assert.equal(a.filter(x=>x.status===201).length,3);assert(a.every(x=>[201,400,409].includes(x.status)));const [[r]]=await db.execute('SELECT SUM(amount) AS n FROM refunds WHERE payment_id=?',[id]);assert.equal(r.n,90);});
 await test('withdrawal status transitions and duplicate payout',async()=>{const id=await withdrawal();for(const [status,expected]of [['Paid',409],['Approved',200],['Approved',409],['Paid',200],['Paid',409],['Rejected',409]])assert.equal((await req('PATCH','/api/finance/withdrawals/'+id,{status})).status,expected);});
 await test('rejected withdrawal is terminal',async()=>{const id=await withdrawal();assert.equal((await req('PATCH','/api/finance/withdrawals/'+id,{status:'Rejected'})).status,200);assert.equal((await req('PATCH','/api/finance/withdrawals/'+id,{status:'Approved'})).status,409);});
 await test('missing withdrawal with valid status is 404',async()=>assert.equal((await req('PATCH','/api/finance/withdrawals/999999',{status:'Approved'})).status,404));
 for(const status of ['INVALID',null,42,{},[]])await test('invalid withdrawal status '+JSON.stringify(status),async()=>assert.equal((await req('PATCH','/api/finance/withdrawals/999999',{status})).status,400));
 for(const reason of [null,'','Valid refund explanation'])await test('valid refund reason '+JSON.stringify(reason),async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1,reason})).status,201);});
 await test('concurrent duplicate approvals produce one winner',async()=>{const id=await withdrawal();const a=await Promise.all(['Approved','Approved'].map(status=>req('PATCH','/api/finance/withdrawals/'+id,{status})));assert.deepEqual(a.map(x=>x.status).sort(),[200,409]);});
 await test('paid withdrawal prevents refund and rolls back',async()=>{
 const id=await fixture();await db.execute('UPDATE provider_earnings SET provider_id=4 WHERE payment_id=?',[id]);
 const [w]=await db.execute("INSERT INTO withdrawal_requests(provider_id,amount,status) VALUES (4,85,'Paid')");
 assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1})).status,409);
 const [[e]]=await db.execute('SELECT gross_amount,net_amount FROM provider_earnings WHERE payment_id=?',[id]);assert.deepEqual(e,{gross_amount:100,net_amount:85});
 const [[r]]=await db.execute('SELECT COUNT(*) AS n FROM refunds WHERE payment_id=?',[id]);assert.equal(r.n,0);
 });
 await test('multi-provider cent refunds preserve accounting',async()=>{
 const id=await fixture(0.03);await db.execute('UPDATE provider_earnings SET gross_amount=0.02,commission_amount=0,net_amount=0.02 WHERE payment_id=?',[id]);
 await db.execute('INSERT INTO provider_earnings(payment_id,provider_id,gross_amount,commission_rate,commission_amount,net_amount) VALUES (?,4,0.01,15,0,0.01)',[id]);
 for(let n=0;n<3;n++){const a=await req('POST','/api/finance/refunds',{payment_id:id,amount:0.01});assert.equal(a.status,201);assert.equal(Math.round(a.body.provider_adjustments.reduce((s,x)=>s+x.gross_reduction,0)*100),1);}
 const [[e]]=await db.execute('SELECT SUM(gross_amount) AS gross,SUM(net_amount) AS net,SUM(commission_amount) AS commission FROM provider_earnings WHERE payment_id=?',[id]);assert.deepEqual(e,{gross:0,net:0,commission:0});
 });
 for(const role of ['customer','provider'])await test(role+' cannot use admin finance endpoints',async()=>{
 const [[u]]=await db.execute('SELECT email FROM Users WHERE role=? LIMIT 1',[role]);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:u.email,password:'FinanceTest123!'})});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 sessions[role]=cookie;
 for(const [m,url,b]of [['GET','payments'],['GET','refunds'],['POST','refunds',{payment_id:1,amount:1}],['GET','earnings'],['GET','withdrawals'],['PATCH','withdrawals/1',{status:'Approved'}],['GET','dashboard']])assert.equal((await req(m,'/api/finance/'+url,b,cookie)).status,403);
 });
 await test('customer payment derives earnings and rejects duplicate payment',async()=>{

 // A separate unpaid invoice uses real invoice items; fixture payment is retained.
 const [period]=await db.execute('INSERT INTO billing_periods(customer_id,period_start,period_end) VALUES (2,?,?)',[`${2050+seq}-01-01`,`${2050+seq++}-02-01`]);
 const [inv]=await db.execute("INSERT INTO invoices(invoice_number,billing_period_id,subtotal,total) VALUES (?,?,100,100)",['UNPAID-'+Date.now(),period.insertId]);
 await db.execute("INSERT INTO invoice_items(invoice_id,provider_id,resource_type,cloud_class,quantity,unit_price,line_total) VALUES (?,3,'CPU','Economy',1,100,100)",[inv.insertId]);
 const a=await Promise.all(Array.from({length:4},()=>req('POST','/api/customers/me/payments',{invoice_id:inv.insertId},sessions.customer)));
 assert.equal(a.filter(x=>x.status===201).length,1);assert(a.every(x=>[201,409].includes(x.status)));
 const [[e]]=await db.execute('SELECT gross_amount,commission_amount,net_amount FROM provider_earnings WHERE payment_id=?',[a.find(x=>x.status===201).body.payment_id]);assert.deepEqual(e,{gross_amount:100,commission_amount:15,net_amount:85});
 });
 await test('concurrent provider requests cannot overdraw available balance',async()=>{
 const before=await req('GET','/api/providers/me/earnings',undefined,sessions.provider);assert.equal(before.status,200);const available=before.body.available_balance;assert(available>0);
 const amount=Math.round(available*0.75*100)/100;
 const a=await Promise.all(Array.from({length:5},()=>req('POST','/api/providers/me/withdrawals',{amount},sessions.provider)));
 assert.equal(a.filter(x=>x.status===201).length,1);assert(a.every(x=>[201,400,409].includes(x.status)));
 const after=await req('GET','/api/providers/me/earnings',undefined,sessions.provider);assert(after.body.available_balance>=0);
 });
 await test('refund request approval records refund once',async()=>{
 const id=await fixture();const r=await req('POST','/api/customers/me/refunds',{payment_id:id,amount:1,reason:'Integration test refund'},sessions.customer);assert.equal(r.status,201);
 const url='/api/admin/refunds/'+r.body.refund_request_id;
 assert.equal((await req('PATCH',url,{status:'Approved'})).status,200);assert.equal((await req('PATCH',url,{status:'Approved'})).status,409);
 });
 await test('concurrent refund retries with the same key execute once',async()=>{
 const id=await fixture();const body={payment_id:id,amount:10,reason:'retry test'};
 const r=await Promise.all(Array.from({length:6},()=>req('POST','/api/finance/refunds',body,admin,{'Idempotency-Key':'same-refund'})));
 assert(r.every(x=>x.status===201));assert(r.every(x=>x.body.refund_id===r[0].body.refund_id));
 const [[row]]=await db.execute('SELECT COUNT(*) AS count,SUM(amount) AS amount FROM refunds WHERE payment_id=?',[id]);assert.deepEqual(row,{count:1,amount:10});
 assert.equal((await req('POST','/api/finance/refunds',{...body,amount:20},admin,{'Idempotency-Key':'same-refund'})).status,409);
 });
 await test('invalid idempotency keys rejected',async()=>{
 for(const key of ['x'.repeat(129),'invalid key'])assert.equal((await req('POST','/api/finance/refunds',{payment_id:999999,amount:1},admin,{'Idempotency-Key':key})).status,400);
 });
 await test('failed refund does not consume idempotency key',async()=>{
 const id=await fixture();const repo=require('../backend/DAL/finance/notification');const saved=repo.insertNotification;repo.insertNotification=async()=>{throw Error('intentional retry rollback test');};
 const body={payment_id:id,amount:1};const headers={'Idempotency-Key':'retry-after-failure'};
 try{assert.equal((await req('POST','/api/finance/refunds',body,admin,headers)).status,500);}finally{repo.insertNotification=saved;}
 assert.equal((await req('POST','/api/finance/refunds',body,admin,headers)).status,201);
 const [[row]]=await db.execute('SELECT COUNT(*) AS count FROM refunds WHERE payment_id=?',[id]);assert.equal(row.count,1);
 });
 await test('report snapshot does not mix a concurrent committed refund',async()=>{
 const id=await fixture();
 await db.withReadSnapshot(async connection=>{
 const [[before]]=await connection.execute('SELECT COALESCE(SUM(amount),0) AS total FROM refunds');
 assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1})).status,201);
 const [[after]]=await connection.execute('SELECT COALESCE(SUM(amount),0) AS total FROM refunds');assert.equal(before.total,after.total);
 });
 });
 for(const [url,body]of [
 ['/api/customers/me/payments',{invoice_id:'1'}],
 ['/api/customers/me/refunds',{payment_id:'1',amount:1,reason:'valid reason'}],
 ['/api/customers/me/refunds',{payment_id:1,amount:'1',reason:'valid reason'}],
 ['/api/customers/me/refunds',{payment_id:1,amount:null,reason:'valid reason'}]
 ])await test('strict customer JSON contract '+JSON.stringify(body),async()=>assert.equal((await req('POST',url,body,sessions.customer)).status,400));
 await test('customer refund request transport retries execute once',async()=>{
 const id=await fixture();const body={payment_id:id,amount:1,reason:'customer retry'};const headers={'Idempotency-Key':'customer-retry'};
 const a=await Promise.all(Array.from({length:6},()=>req('POST','/api/customers/me/refunds',body,sessions.customer,headers)));
 assert(a.every(x=>x.status===201));assert(a.every(x=>x.body.refund_request_id===a[0].body.refund_request_id));
 const [[row]]=await db.execute('SELECT COUNT(*) AS count FROM refund_requests WHERE payment_id=?',[id]);assert.equal(row.count,1);
 assert.equal((await req('POST','/api/customers/me/refunds',{...body,amount:2},sessions.customer,headers)).status,409);
 });
 await test('provider withdrawal transport retries execute once',async()=>{
 await fixture();const headers={'Idempotency-Key':'provider-retry'};
 const a=await Promise.all(Array.from({length:6},()=>req('POST','/api/providers/me/withdrawals',{amount:1},sessions.provider,headers)));
 assert(a.every(x=>x.status===201));assert(a.every(x=>x.body.withdrawal_id===a[0].body.withdrawal_id));
 assert.equal((await req('POST','/api/providers/me/withdrawals',{amount:2},sessions.provider,headers)).status,409);
 });
 for(const amount of ['1',1.001])await test('strict withdrawal money '+JSON.stringify(amount),async()=>assert.equal((await req('POST','/api/providers/me/withdrawals',{amount},sessions.provider)).status,400));
 for(const note of [{},'x'.repeat(256)])await test('invalid withdrawal note '+JSON.stringify(note).slice(0,30),async()=>assert.equal((await req('POST','/api/providers/me/withdrawals',{amount:1,note},sessions.provider)).status,400));
 await test('sub-cent refund is rejected rather than rounded',async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1.001})).status,400);});
 await test('renamed pricing invoice and discount repositories work together',async()=>{
 let r=await req('POST','/api/pricing',{resource_type:'CPU',cloud_class:'Economy',unit_price:2});assert.equal(r.status,201);const priceId=r.body.id;
 assert.equal((await req('PUT','/api/pricing/'+priceId,{unit_price:3})).status,200);
 assert.equal((await req('GET','/api/pricing/'+priceId+'/history')).status,200);
 r=await req('POST','/api/discounts',{code:'REFACTOR10',discount_type:'Percentage',discount_value:10});assert.equal(r.status,201);
 const discountId=r.body.id;assert.equal((await req('PATCH','/api/discounts/'+discountId,{active:true})).status,200);
 const check=await req('POST','/api/discounts/validate',{code:'REFACTOR10',subtotal:30});assert.equal(check.status,200);assert.equal(check.body.discount_amount,3);
 r=await req('POST','/api/billing/invoices',{customer_id:2,billing_period_start:'2040-01-01',billing_period_end:'2040-02-01',discount_code:'REFACTOR10',resources:[{resource_type:'CPU',cloud_class:'Economy',quantity:10,provider_id:3}]});
 assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal((await req('DELETE','/api/pricing/'+priceId)).status,200);
 });
 for(const limit of ['abc','-1','0','201','1.5','1e2','0x10','', '1&limit=2'])await test('audit limit rejects '+limit,async()=>assert.equal((await req('GET','/api/admin/audit-log?limit='+limit)).status,400));
 for(const limit of [1,50,200])await test('audit limit accepts '+limit,async()=>assert.equal((await req('GET','/api/admin/audit-log?limit='+limit)).status,200));
 for(const [field,value]of [['max_uses',true],['max_uses','1'],['max_uses',2147483648],['active',0],['active',1],['expires_at',false],['expires_at','2027-02-30T00:00:00Z'],['expires_at','2027-01-01'],['expires_at','2027-01-01T25:00:00Z']])await test('discount strict field '+field+'='+JSON.stringify(value),async()=>{
 assert.equal((await req('POST','/api/discounts',{code:'BADFIELD'+Date.now(),discount_type:'Percentage',discount_value:10,[field]:value})).status,400);
 });
 await test('discount expiry normalizes timezone and accepts null',async()=>{
 const r=await req('POST','/api/discounts',{code:'UTCEXPIRY',discount_type:'Percentage',discount_value:10,max_uses:null,expires_at:'2090-01-01T02:00:00+02:00',active:true});assert.equal(r.status,201);assert.equal(r.body.expires_at,'2090-01-01 00:00:00');
 assert.equal((await req('PATCH','/api/discounts/'+r.body.id,{expires_at:null,active:false,max_uses:1})).status,200);
 });
 await test('checkout subtotal bounds reject before calculation',async()=>{
 assert.equal((await req('POST','/api/discounts',{code:'BOUNDARY10',discount_type:'Percentage',discount_value:10})).status,201);
 for(const subtotal of [1e100,'100',null,true,-1])assert.equal((await req('POST','/api/discounts/validate',{code:'BOUNDARY10',subtotal})).status,400);
 for(const subtotal of [0,100,9999999999.99])assert.equal((await req('POST','/api/discounts/validate',{code:'BOUNDARY10',subtotal})).status,200);
 });
 await test('price overflow and aggregate bounds produce controlled 400',async()=>{
 for(const type of ['CPU','RAM','Storage','GPU'])await db.execute("INSERT INTO pricing_rules(resource_type,cloud_class,unit_price) VALUES (?,'Business',1)",[type]);
 for(const q of [1e308,10000000000])assert.equal((await req('POST','/api/pricing/calculate',{cloud_class:'Business',cpu_cores:q,ram_gb:1,storage_gb:1})).status,400);
 assert.equal((await req('POST','/api/pricing/calculate',{cloud_class:'Business',cpu_cores:6000000000,ram_gb:6000000000,storage_gb:1})).status,400);
 const good=await req('POST','/api/pricing/calculate',{cloud_class:'Business',cpu_cores:1,ram_gb:2,storage_gb:3});assert.equal(good.status,200);assert.equal(good.body.estimated_monthly_price,6);
 await db.execute("UPDATE pricing_rules SET unit_price=2 WHERE resource_type='CPU' AND cloud_class='Business'");
 assert.equal((await req('POST','/api/pricing/calculate',{cloud_class:'Business',cpu_cores:9999999999,ram_gb:0,storage_gb:0})).status,400);
 });
 await test('usage preview empty and storage usage remains billable',async()=>{
 const body={customer_id:2,billing_period_start:'2026-09-01',billing_period_end:'2026-10-01',dry_run:true};
 let r=await req('POST','/api/billing/usage-invoices',body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.total,0);
 assert.equal((await req('POST','/api/billing/usage-invoices',{...body,dry_run:false})).status,409);
 await db.execute("INSERT INTO pricing_rules(resource_type,cloud_class,unit_price) VALUES ('Storage','Economy',1)");
 await db.execute("INSERT INTO InstanceStorageUsage(vm_id,customer_id,provider_id,cloud_class,quantity,started_at,ended_at) VALUES (9001,2,3,'Economy',10,'2026-09-01 00:00:00','2026-10-01 00:00:00')");
 r=await req('POST','/api/billing/usage-invoices',body);assert.equal(r.status,200);assert.equal(r.body.total,10);assert.equal(r.body.items[0].quantity,10);
 r=await req('POST','/api/billing/usage-invoices',{...body,dry_run:false});assert.equal(r.status,201);assert.equal(r.body.total,10);
 assert.equal((await req('POST','/api/billing/usage-invoices',{...body,dry_run:false})).status,409);
 const migration=fs.readFileSync(path.join(original,'database/migrations/finance_storage_usage.sql'),'utf8');
 await db.query(migration);await db.query(migration);
 const [[meter]]=await db.execute('SELECT quantity FROM InstanceStorageUsage WHERE vm_id=9001');assert.equal(meter.quantity,10);
 await db.query('RENAME TABLE InstanceStorageUsage TO TestSavedStorageUsage');
 try{assert.equal((await req('POST','/api/billing/usage-invoices',body)).status,503);}finally{await db.query('RENAME TABLE TestSavedStorageUsage TO InstanceStorageUsage');}
 });
 await test('numeric discount code rejected',async()=>assert.equal((await req('POST','/api/discounts',{code:42,discount_type:'Fixed',discount_value:1})).status,400));
 await test('numeric string amount rejected by JSON contract',async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:'1'})).status,400);});
 await test('object reason rejected by JSON contract',async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1,reason:{unexpected:'object'}})).status,400);});
 await test('long reason rejected without silent truncation',async()=>{const id=await fixture();assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:1,reason:'x'.repeat(256)})).status,400);});
 await test('rollback when notification fails',async()=>{
 const id=await fixture();const repository=require('../backend/DAL/finance/notification');const original=repository.insertNotification;repository.insertNotification=async()=>{throw Error('test-injected notification failure');};
 try{assert.equal((await req('POST','/api/finance/refunds',{payment_id:id,amount:10})).status,500);}finally{repository.insertNotification=original;}
 const [[r]]=await db.execute('SELECT COUNT(*) AS n FROM refunds WHERE payment_id=?',[id]);assert.equal(r.n,0);const [[e]]=await db.execute('SELECT gross_amount FROM provider_earnings WHERE payment_id=?',[id]);assert.equal(e.gross_amount,100);
 });
 await test('dashboard reconciles populated data',async()=>{const r=await req('GET','/api/finance/dashboard');assert.equal(r.status,200);const b=r.body;assert.equal(b.revenue.net_revenue,Math.round((b.payments.recorded_total-b.refunds.total)*100)/100);assert.equal(Math.round((b.earnings.provider_net+b.earnings.platform_commission)*100),Math.round(b.earnings.provider_gross*100));});
}
run().catch(e=>results.push({name:'setup',pass:false,error:e.message})).finally(async()=>{
 if(server)await new Promise(r=>server.close(r));
 if(db){
  if(!/^finance_review_[0-9]+$/.test(database))throw Error('Unsafe test database cleanup target');
  await db.query('DROP DATABASE `'+database+'`');await db.end();
 }
 if(process.env.FINANCE_TEST_REPORT)fs.writeFileSync(process.env.FINANCE_TEST_REPORT,JSON.stringify(results,null,2));console.log(JSON.stringify({total:results.length,failed:results.filter(r=>!r.pass)},null,2));process.exitCode=results.some(r=>!r.pass)?1:0;
});
