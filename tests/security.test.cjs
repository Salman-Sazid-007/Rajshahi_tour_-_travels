'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repo=path.resolve(__dirname,'..');

test('production refuses missing or public default JWT secrets',()=>{
  for(const JWT_SECRET of ['', 'rajshahi-tours-travels-secret-key-2026-secure']) {
    const result=spawnSync(process.execPath,['-e',"require('./backend/src/config/env')"],{cwd:repo,encoding:'utf8',env:{...process.env,NODE_ENV:'production',JWT_SECRET}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/Production requires/);
  }
});
test('one-time owner provisioning disables demo accounts and requires the actual hashed password',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rtt-owner-'));
  try {
    const password=randomBytes(20).toString('base64url');
    const env={...process.env,NODE_ENV:'production',JWT_SECRET:randomBytes(32).toString('hex'),RTT_DATA_FILE:path.join(directory,'store.json'),SMS_ENABLED:'false',RTT_OWNER_NAME:'Test owner',RTT_OWNER_EMAIL:'owner@example.test',RTT_OWNER_PHONE:'+15555550199',RTT_OWNER_PASSWORD:password};
    const setup=spawnSync(process.execPath,['backend/scripts/setup-owner.js'],{cwd:repo,env,encoding:'utf8'});
    assert.equal(setup.status,0,setup.stderr);assert.ok(!setup.stdout.includes(password));
    const check=spawnSync(process.execPath,['-e',`const store=require('./backend/src/services/store'); console.log(JSON.stringify({demo:store.listDemoAccounts(),shortcut:store.authenticateUser({phoneOrRole:'owner',password:'demo'}),valid:Boolean(store.authenticateUser({phoneOrRole:'owner@example.test',password:process.env.RTT_OWNER_PASSWORD})),bad:store.authenticateUser({phoneOrRole:'owner@example.test',password:'wrong-password'})}));`],{cwd:repo,env,encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);const result=JSON.parse(check.stdout);
    assert.deepEqual(result,{demo:[],shortcut:null,valid:true,bad:null});
    const state=JSON.parse(fs.readFileSync(env.RTT_DATA_FILE,'utf8'));assert.ok(!JSON.stringify(state).includes(password));assert.ok(state.users.filter((u)=>u.phone.startsWith('000')).every((u)=>!u.isActive));
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
