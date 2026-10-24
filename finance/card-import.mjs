/* Imported card identity is deliberately restricted to an internal profile id and last four digits. */
export function cardLast4(value){
 const s=String(value??"").normalize("NFKC").trim().replace(/[\u200e\u200f\u202a-\u202e]/g,"");
 if(!s)return null;
 if(typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=9999)return String(value).padStart(4,"0");
 if(/^\d{4}$/.test(s))return s;
 // Full numeric card values are not saved: only derive the last four.
 const digits=s.replace(/[\s-]/g,"");
 if(/^\d{12,19}$/.test(digits))return digits.slice(-4);
 const trailing=s.match(/(?:\*{2,}|x{2,}|X{2,}|#{2,}|•{2,}|\b(?:card|visa|mastercard|amex|כרטיס|אשראי)\b)[^\d]{0,30}(\d{4})\s*$/i);
 return trailing?.[1]||null;
}
export function cardFingerprintInput(cardId,row){
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(cardId)))throw Error("Missing confirmed card identifier");
 if(!row.importIdentity||!Number.isInteger(row.importSequence)||row.importSequence<1)throw Error("Invalid statement row identity");
 return "tevuna-credit-card-v3|"+cardId+"|"+row.importIdentity+"|"+row.importSequence;
}
export function cardCheck(rows,cardLastDigits){
 if(!/^\d{4}$/.test(String(cardLastDigits)))return {ok:false,reason:"יש לציין את ארבע הספרות האחרונות של הכרטיס."};
 const different=[...new Set(rows.map(r=>r.rowCardLast4).filter(Boolean))];
 if(different.length>1)return {ok:false,reason:"הגיליון מכיל מספר כרטיסי אשראי שונים. יש לפצל אותו לגיליונות או לקבצים לפי כרטיס ולייבא כל אחד בנפרד."};
 if(different.length && different[0]!==cardLastDigits)return {ok:false,reason:"מספר הכרטיס בקובץ מסתיים ב-"+different[0]+" אבל נבחר כרטיס שמסתיים ב-"+cardLastDigits+". בחרו את הכרטיס הנכון."};
 return {ok:true,reason:different.length?"הכרטיס תואם לעמודת הזיהוי בקובץ.":"לא נמצאה בקובץ עמודת כרטיס חד־משמעית. הזיהוי מבוסס על הכרטיס שבחרתם."};
}

/* Legacy imports lacked payment-card IDs. Exact matches are warnings only:
   neither a confirmed duplicate nor evidence of separate card spending. */
const similarKey=row=>[
 String(row.occurred_on||""),
 String(row.merchant||"").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim(),
 String(row.amount_agorot||0),
 String(row.entry_kind||"expense")
].join("|");
export function potentialLegacyOverlap(incoming,legacy){
 const counts=new Map();
 for(const row of legacy||[]){const k=similarKey(row);counts.set(k,(counts.get(k)||0)+1)}
 let possible=0;
 for(const row of incoming||[]){
  const k=similarKey(row),available=counts.get(k)||0;
  if(available>0){possible++;counts.set(k,available-1)}
 }
 return possible;
}

export function spendingByCard(transactions,cards=[]){
 const profiles=new Map(cards.map(c=>[c.id,c.nickname+" •••• "+c.last4]));
 const sums=new Map();
 for(const t of transactions||[]){
  const key=t.source==="manual"?"manual":t.card_id||"legacy";
  if(!sums.has(key))sums.set(key,{key,label:key==="manual"?"הוצאות ידניות":key==="legacy"?"ייבואים קודמים ללא זיהוי כרטיס":profiles.get(key)||"כרטיס לא מזוהה",total:0,count:0});
  const item=sums.get(key);item.total+=(t.entry_kind==="refund"?-1:1)*Number(t.amount_agorot||0);item.count++;
 }
 return [...sums.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"he"));
}

/**
 * Returns reconciliation-safe net card spending and the most expensive
 * categories on each card. All values remain integer agorot.
 * Unidentified legacy imports stay visible, not assigned by guesswork.
 */
export function cardSpendingReport(transactions,cards=[]){
 const base=spendingByCard(transactions,cards);
 const credit=base.filter(x=>x.key!=="manual");
 const positiveBasis=credit.reduce((n,x)=>n+Math.max(0,x.total),0);
 const complete=base.map(group=>{
  const byCategory=new Map();
  for(const tx of transactions||[]){
   const key=tx.source==="manual"?"manual":tx.card_id||"legacy";
   if(key!==group.key)continue;
   const name=String(tx.category||"אחר");
   byCategory.set(name,(byCategory.get(name)||0)+
    (tx.entry_kind==="refund"?-1:1)*Number(tx.amount_agorot||0));
  }
  const categories=[...byCategory.entries()].map(([name,amount])=>({name,amount}))
   .sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,"he"));
  return {...group,percentage:group.key==="manual"||!positiveBasis?null:
   Math.max(0,group.total)/positiveBasis*100,
   categories:categories.filter(x=>x.amount>0).slice(0,3)};
 });
 return {groups:complete,positiveBasis,
  creditNetTotal:credit.reduce((n,x)=>n+x.total,0),
  identifiedNetTotal:credit.filter(x=>x.key!=="legacy").reduce((n,x)=>n+x.total,0),
  unassignedNetTotal:credit.find(x=>x.key==="legacy")?.total||0,
  biggestIdentified:complete.filter(x=>x.key!=="manual"&&x.key!=="legacy"&&x.total>0)[0]||null};
}

/** Identity summary for one sheet. One workbook can contain several cards. */
export function sheetCardSummary(rows){
 const counts=new Map(),unknown=[];
 for(const r of rows||[]){
  const digits=cardLast4(r.rowCardLast4);
  if(digits)counts.set(digits,(counts.get(digits)||0)+1);
  else unknown.push(r.line);
 }
 return {cards:[...counts].map(([last4,count])=>({last4,count})).sort((a,b)=>b.count-a.count),
  unknownCount:unknown.length,unknownLines:unknown.slice(0,15),
  allIdentified:unknown.length===0 && counts.size>0};
}
