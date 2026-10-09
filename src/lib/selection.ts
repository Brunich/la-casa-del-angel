export interface SelectionTicket{residentId:string;generation:number}
export class SelectionGate{
 current='';private generation=0;
 select(residentId:string){if(residentId!==this.current){this.current=residentId;this.generation++;}}
 capture():SelectionTicket{return{residentId:this.current,generation:this.generation}}
 isCurrent(ticket:SelectionTicket){return ticket.residentId===this.current&&ticket.generation===this.generation}
 invalidate(){this.generation++;}
}
