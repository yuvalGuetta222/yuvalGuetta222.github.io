export function categoryBreakdown(transactions){
 const groups=new Map();
 for(const tx of transactions||[]){
  const name=String(tx.category||"אחר");
  const amount=Number(tx.amount_agorot)||0;
  const signed=(tx.entry_kind==="refund"?-1:1)*amount;
  if(!groups.has(name))groups.set(name,{name,net:0,count:0,items:[]});
  const g=groups.get(name);g.net+=signed;g.count++;g.items.push(tx);
 }
 const groupsSorted=[...groups.values()].sort((a,b)=>b.net-a.net||a.name.localeCompare(b.name,"he"));
 const positiveTotal=groupsSorted.reduce((sum,g)=>sum+Math.max(0,g.net),0);
 const netTotal=groupsSorted.reduce((sum,g)=>sum+g.net,0);
 return {groups:groupsSorted,positiveTotal,netTotal,max:Math.max(1,...groupsSorted.map(g=>Math.max(0,g.net)))};
}
