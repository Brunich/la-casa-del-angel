export class NotificationQueue{
 private generation=0;
 private tail:Promise<void>=Promise.resolve();
 run(task:(isCurrent:()=>boolean)=>Promise<void>):Promise<void>{
  const token=++this.generation;
  const current=()=>token===this.generation;
  const result=this.tail.then(async()=>{if(current())await task(current)});
  this.tail=result.catch(()=>{});
  return result;
 }
}
