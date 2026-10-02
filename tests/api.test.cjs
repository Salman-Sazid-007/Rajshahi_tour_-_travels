'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let server, base, token, directory;
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(),'rtt-api-'));
  process.env.RTT_DATA_FILE = path.join(directory,'store.json');
  process.env.SMS_ENABLED = 'false';
  const app = require('../backend/src/app');
  server = app.listen(0,'127.0.0.1');
  await new Promise((resolve) => server.once('listening',resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneOrRole:'owner',password:'demo'})});
  token=(await response.json()).token;
});
after(async () => { await new Promise((resolve)=>server.close(resolve)); fs.rmSync(directory,{recursive:true,force:true}); });
const request = (url,body,auth=false,method=body?'POST':'GET') => fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});

test('public bootstrap has correct contact details and no passenger identities', async () => {
  const data=await (await request('/api/public/bootstrap')).json();
  assert.equal(data.siteSettings.phone,'01782250709'); assert.equal(data.siteSettings.whatsapp,'8801782250709'); assert.equal(data.siteSettings.bkashNumber,'01782250709');
  assert.ok(data.upcomingTours.every((tour)=>!('bookings' in tour)));
  const seats=await (await request('/api/public/tours/tour-sylhet-oct/seats')).json();
  assert.equal(seats.seats.length,46);assert.ok(seats.occupied.every((seat)=>Object.keys(seat).every((key)=>['id','gender','status'].includes(key))));
});
test('fleet and confirmed-booking writes require staff authentication', async () => {
  assert.equal((await request('/api/buses')).status,401);
  assert.equal((await request('/api/bus-overrides',{busId:'bus-rajshahi-express'})).status,401);
  assert.equal((await request('/api/bookings',{})).status,401);
  assert.equal((await request('/api/tours',{})).status,401);
});
test('regular bus API rejects setup-free sales and returns clear setup status', async () => {
  const data=await (await request('/api/public/bus-services?date=2099-01-05')).json();
  assert.ok(data.services.every((s)=>!s.bookable&&s.status==='setup_required'));
  assert.equal((await request('/api/public/bus-tickets',{busId:'bus-rajshahi-express',serviceId:'rajshahi-dhaka',date:'2099-01-05'})).status,409);
});
test('configured ticket API calculates fare and serializes competing seat requests', async () => {
  const fleet=await (await request('/api/buses',null,true)).json();const bus=fleet.buses[0];
  const config={...bus,services:bus.services.map((s)=>({...s,enabled:true,fare:700,departureTime:'21:30',boardingPoint:'Test terminal'}))};
  assert.equal((await request(`/api/buses/${bus.id}`,config,true,'PUT')).status,200);
  const payload={busId:bus.id,serviceId:'rajshahi-dhaka',date:'2099-01-05',name:'Test traveler',phone:'+15555550100',seats:[{id:'K-5',gender:'female'}],totalAmount:1};
  const responses=await Promise.all([request('/api/public/bus-tickets',payload),request('/api/public/bus-tickets',payload)]);
  assert.deepEqual(responses.map((r)=>r.status).sort(),[201,409]);
  const success=responses.find((r)=>r.status===201);const data=await success.json();
  assert.equal(data.ticket.totalAmount,700);assert.equal(data.ticket.status,'pending');assert.equal(data.ticket.paymentNumber,'01782250709');
  const publicData=await (await request('/api/public/bus-services?date=2099-01-05')).json();
  assert.deepEqual(publicData.services[0].occupied,[{id:'K-5',gender:'female',status:'reserved'}]);
  assert.ok(!JSON.stringify(publicData).includes(payload.phone));
  const confirmation=await request(`/api/bus-tickets/${data.ticket.id}`,{status:'confirmed',paymentVerified:true},true,'PATCH');
  assert.equal(confirmation.status,200);assert.equal((await confirmation.json()).ticket.paymentStatus,'verified');
});
test('guide cannot change fleet settings or approve paid tickets', async () => {
  const login=await request('/api/auth/login',{phoneOrRole:'guide',password:'demo'});const guide=(await login.json()).token;
  const response=await fetch(base+'/api/buses/bus-rajshahi-express',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${guide}`},body:JSON.stringify({status:'maintenance'})});
  assert.equal(response.status,403);
});
