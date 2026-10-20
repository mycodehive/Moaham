const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {AppUpdates}=require('../src/updates.cjs');
function fixture(){
 const engine=new EventEmitter();let checks=0,downloads=0,installs=0;
 engine.checkForUpdates=async()=>{checks++;engine.emit('checking-for-update');engine.emit('update-available',{version:'1.4.0'});};
 engine.downloadUpdate=async()=>{downloads++;engine.emit('download-progress',{percent:50});engine.emit('update-downloaded',{version:'1.4.0'});};
 engine.quitAndInstall=(silent,restart)=>{assert.equal(silent,true);assert.equal(restart,true);installs++;};
 const updates=new AppUpdates(engine,{version:'1.3.0',enabled:true});return {engine,updates,counts:()=>({checks,downloads,installs})};
}
test('checking never downloads or installs, and download never installs without consent',async()=>{
 const {engine,updates,counts}=fixture();assert.equal(engine.autoDownload,false);assert.equal(engine.autoInstallOnAppQuit,false);assert.equal(engine.allowPrerelease,false);assert.equal(engine.allowDowngrade,false);
 await updates.check();assert.equal(updates.status().state,'available');assert.deepEqual(counts(),{checks:1,downloads:0,installs:0});
 await updates.download();assert.equal(updates.status().state,'downloaded');assert.deepEqual(counts(),{checks:1,downloads:1,installs:0});
 await updates.check();assert.equal(updates.status().state,'downloaded');assert.equal(counts().checks,1);
 updates.install();assert.equal(counts().installs,1);assert.throws(()=>updates.install());
});
test('offline and failed downloads are recoverable and cannot be installed',async()=>{
 const {engine,updates}=fixture();engine.checkForUpdates=async()=>{throw new Error('offline');};await updates.check();assert.equal(updates.status().state,'error');assert.throws(()=>updates.install());
 engine.checkForUpdates=async()=>engine.emit('update-available',{version:'1.4.0'});await updates.check();
 engine.downloadUpdate=async()=>{engine.emit('error',new Error('sha512 mismatch'));throw new Error('bad hash');};await updates.download();assert.equal(updates.status().state,'error');assert.throws(()=>updates.install());
});
test('concurrent checks are coalesced and downloads require an available update',async()=>{
 const {engine,updates,counts}=fixture();let release;
 engine.checkForUpdates=()=>new Promise(resolve=>{release=resolve;});const first=updates.check();await updates.check();release();await first;
 await assert.rejects(()=>updates.download());assert.deepEqual(counts(),{checks:0,downloads:0,installs:0});
});
test('development and unsupported platforms never contact update services',async()=>{
 const updates=new AppUpdates(null,{version:'1.3.0',enabled:false});assert.equal((await updates.check()).state,'unsupported');await assert.rejects(()=>updates.download());assert.throws(()=>updates.install());
});
