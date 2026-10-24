/** Controls are source workbook claims, not external bank-verified amounts.
 * Choose the most complete detailed source for each known issuer, instead
 * of summing overlapping partial files and double-counting transactions. */
export function reconcileSources(reports=[]){
 const groups=new Map();
 for(const b of reports){
  const issuer=String(b.filename||"").includes("ויזה_7888")?"visa7888":
    String(b.filename||"").includes("אשראי_מאוחד")?"max":"other:"+String(b.filename||"unknown");
  if(!groups.has(issuer))groups.set(issuer,[]);
  groups.get(issuer).push(b);
 }
 return [...groups].map(([issuer,batches])=>{
  const sorted=[...batches].sort((a,b)=>
    Number(b.transaction_count||0)-Number(a.transaction_count||0)
    ||Number(b.net_amount_agorot||0)-Number(a.net_amount_agorot||0));
  const mostComplete=sorted[0];
  const claims=batches.map(x=>x.source_header_total_agorot).filter(x=>x!==null&&x!==undefined).map(Number);
  const claimed=claims.length?Math.max(...claims):null;
  const counted=Number(mostComplete.net_amount_agorot||0);
  const difference=claimed===null?null:claimed-counted;
  const countMatch=batches.every(x=>x.expected_count===null||
    Number(x.expected_count)===Number(x.transaction_count));
  const itemTotalMatch=batches.every(x=>x.expected_net_agorot===null||
    Number(x.expected_net_agorot)===Number(x.net_amount_agorot));
  return {issuer,
   label:issuer==="visa7888"?"Visa •••• 7888":issuer==="max"?"MAX":"דוח אשראי אחר",
   mostCompleteFilename:mostComplete.filename,reportCount:batches.length,
   matchedFile:countMatch&&itemTotalMatch,headerClaimAgorot:claimed,
   bestDetailedAgorot:counted,gapAgorot:difference,
   differentHeaderClaims:new Set(claims).size>1,
   status:!countMatch||!itemTotalMatch?"file_mismatch":
    claimed===null?"unverified":difference===0?"source_matched":"source_disputed"};
 });
}
