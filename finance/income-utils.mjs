export const firstOfMonth=month=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+"-01":null;
export function applicableRecurring(templates,month){
 const target=firstOfMonth(month);if(!target)return [];
 return (templates||[]).filter(x=>x.active!==false&&x.start_month<=target&&(!x.end_month||x.end_month>=target));
}
export function recurringIncomeSummary(templates,incomes,month){
 const active=applicableRecurring(templates,month);
 const receipts=(incomes||[]).filter(x=>x.received);
 const receiptIds=new Set(receipts.map(x=>x.recurring_income_id).filter(Boolean));
 const expected=active.filter(x=>!receiptIds.has(x.id));
 const scheduled=active.reduce((s,x)=>s+(Number(x.amount_agorot)||0),0);
 const pending=expected.reduce((s,x)=>s+(Number(x.amount_agorot)||0),0);
 const received=receipts.reduce((s,x)=>s+(Number(x.amount_agorot)||0),0);
 return {active,expected,scheduled,pending,received};
}
