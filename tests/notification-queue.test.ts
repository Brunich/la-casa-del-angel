import test from 'node:test';
import assert from 'node:assert/strict';
const lib=await import('../src/lib/notification-queue.ts').catch(()=>null);
test('new reminder synchronization invalidates an older pending schedule',async()=>{
 assert.ok(lib,'notification queue must exist');const queue=new lib.NotificationQueue();const effects:string[]=[];let resume!:()=>void;const barrier=new Promise<void>(r=>{resume=r});let entered!:()=>void;const started=new Promise<void>(r=>{entered=r});
 const old=queue.run(async current=>{entered();await barrier;if(current())effects.push('old schedule')});
 await started;const latest=queue.run(async current=>{if(current())effects.push('new schedule')});resume();await Promise.all([old,latest]);assert.deepEqual(effects,['new schedule']);
});
test('logout cancellation is the final operation after an already running task',async()=>{
 assert.ok(lib);const queue=new lib.NotificationQueue();const effects:string[]=[];let resume!:()=>void;const barrier=new Promise<void>(r=>{resume=r});let entered!:()=>void;const started=new Promise<void>(r=>{entered=r});
 const work=queue.run(async current=>{effects.push('started');entered();await barrier;if(current())effects.push('late schedule')});await started;
 const clear=queue.run(async current=>{if(current())effects.push('cancel all')});resume();await Promise.all([work,clear]);assert.deepEqual(effects,['started','cancel all']);
});
