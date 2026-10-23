/* Household planning ledger: values stored in agorot.
Fixed expenses are an average monthly provision, not verified bank debits.
Only a specifically linked, current-month card transaction reduces the provision. */
export function fixedMonthlyProvision(item){
 if(!item || !item.active)return 0;
 const cadence={monthly:1,bimonthly:2,quarterly:3,yearly:12}[item.cadence]||1;
 return Math.round((Number(item.amount_agorot)||0)/cadence);
}
export function householdBalance({incomes=[],transactions=[],fixed=[],coverage=[]}){
 const confirmedIncome=incomes.filter(x=>x.received).reduce((sum,x)=>sum+(Number(x.amount_agorot)||0),0);
 const recordedSpending=transactions.reduce((sum,x)=>sum+(x.entry_kind==="refund"?-1:1)*(Number(x.amount_agorot)||0),0);
 const transactionById=new Map(transactions.filter(x=>x.entry_kind!=="refund").map(t=>[t.id,t]));
 const coverageByFixedId=new Map(coverage.map(c=>[c.fixed_expense_id,c.transaction_id]));
 let planned=0, matched=0, unmatched=0, matchedCount=0;
 const fixedItems=[];
 for(const item of fixed){
  const amount=fixedMonthlyProvision(item);
  if(amount<=0)continue;
  const tx=transactionById.get(coverageByFixedId.get(item.id));
  const included=tx?Math.min(amount,Math.max(0,Number(tx.amount_agorot)||0)):0;
  planned+=amount;matched+=included;unmatched+=amount-included;
  if(included>0)matchedCount++;
  fixedItems.push({id:item.id,label:item.label,planned:amount,included,
   reserved:amount-included,matchedTransactionId:included>0?tx.id:null});
 }
 const beforeProvisions=confirmedIncome-recordedSpending;
 return {confirmedIncome,recordedSpending,planned,matched,unmatched,matchedCount,
  beforeProvisions,availableAfterProvisions:beforeProvisions-unmatched,fixedItems};
}
