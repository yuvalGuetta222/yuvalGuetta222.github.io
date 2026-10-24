/* Imported card identity is deliberately restricted to an internal profile id and last four digits. */
export function cardLast4(value){
 const s=String(value??"").normalize("NFKC").trim().replace(/[\u200e\u200f\u202a-\u202e]/g,"");
 if(!s)return null;
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
