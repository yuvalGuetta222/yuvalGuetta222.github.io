/* Decision-support summaries based only on stored transaction records. */
export const ILS = v=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0}).format(v/100);
const discretionary=["מסעדות ומשלוחים","קניות","בילויים"];
export function aggregate(rows){
 const categories=new Map(),merchants=new Map();
 let spent=0, refunds=0, charges=0;
 for(const t of rows||[]){
  const amount=Number(t.amount_agorot)||0,sign=t.entry_kind==="refund"?-1:1;
  if(sign===-1)refunds+=amount;else charges+=amount;
  spent+=sign*amount;
  categories.set(t.category||"אחר",(categories.get(t.category||"אחר")||0)+sign*amount);
  const k=String(t.merchant||"לא ידוע").trim().replace(/\s+/g," ");
  merchants.set(k,(merchants.get(k)||0)+sign*amount);
 }
 return {spent,refunds,charges,categories:[...categories].sort((a,b)=>b[1]-a[1]),merchants:[...merchants].sort((a,b)=>b[1]-a[1])};
}
export function generateInsights({current=[],previous=[],budgets=[],month,now=new Date()}) {
 const c=aggregate(current),prev=aggregate(previous),insights=[];
 const isThisMonth=month===[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0")].join("-");
 const day=isThisMonth?now.getDate():31;
 const lastMonthComparable = isThisMonth?previous.filter(t=>Number(String(t.occurred_on).slice(-2))<=day):previous;
 const prevComparable=aggregate(lastMonthComparable);
 const budgetMap=new Map((budgets||[]).map(x=>[x.category,Number(x.amount_agorot)||0]));
 for(const [category,amount] of c.categories) {
  if(amount<=0)continue;
  if(budgetMap.has(category)){
   const cap=budgetMap.get(category);
   if(amount>cap){insights.push({priority:3,kind:"budget",title:"חריגה בתקציב: "+category,body:"הוצאות בסך "+ILS(amount)+" מול מסגרת "+ILS(cap)+". החריגה היא "+ILS(amount-cap)+".",action:"בדקו עסקאות בקטגוריה ושקלו להתאים את המסגרת או את ההוצאות.",category})}
  }
 }
 for(const [category,amount] of c.categories) {
  if(amount<=0 || budgetMap.has(category)&&amount>budgetMap.get(category))continue;
  const old=prevComparable.categories.find(([c])=>c===category)?.[1]||0;
  if(old>=15000 && amount-old>=20000 && amount>=old*1.25 && previous.length>0) {
   const pct=Math.round((amount-old)/old*100);
   insights.push({priority:2,kind:"jump",title:"עלייה של "+pct+"% ב"+category,body:ILS(amount)+" כעת לעומת "+ILS(old)+" בתקופה המקבילה של החודש הקודם"+(isThisMonth?" (עד אותו יום)":"")+".",action:"בדקו אם מדובר בקנייה חד-פעמית לפני שינוי הרגלים.",category});
  }
 }
 for(const [merchant,amount] of c.merchants){
  const previousCharge=prev.merchants.find(([m])=>m.toLowerCase()===merchant.toLowerCase())?.[1]||0;
  if(amount>=2000&&previousCharge>=2000&&Math.abs(amount-previousCharge)<=Math.max(100,previousCharge*.1)){
   insights.push({priority:1,kind:"recurring",title:"חיוב שנראה חוזר: "+merchant,body:"חיוב של "+ILS(amount)+" החודש וחיוב דומה של "+ILS(previousCharge)+" בחודש הקודם.",action:"בדקו אם מדובר במנוי, הוראת קבע או רכישה חוזרת לפני שמבטלים משהו.",category:null});
  }
  if(insights.filter(x=>x.kind==="recurring").length>=2)break;
 }
 if(c.spent>0&&c.merchants.length){
  const [name,amount]=c.merchants[0];
  if(amount>0)insights.push({priority:1,kind:"merchant",title:"בית העסק המרכזי החודש",body:name+": "+ILS(amount)+". המידע מתייחס לעסקאות שנשמרו בלבד.",action:"בדקו את פירוט החיובים לפני שמסיקים שיש הוצאה מיותרת.",category:null});
 }
 const flexible=c.categories.filter(([name])=>discretionary.includes(name)).reduce((s,[,n])=>s+Math.max(0,n),0);
 if(flexible>=15000){
  const hypothetical=Math.round(flexible*.15);
  insights.push({priority:2,kind:"saving",title:"תרחיש לחיסכון בהוצאות גמישות",body:"ההוצאות על אוכל בחוץ, קניות ובילויים הן "+ILS(flexible)+". צמצום היפותטי של 15% עשוי לפנות "+ILS(hypothetical)+" בחודש, או "+ILS(hypothetical*12)+" בשנה אם יתמידו בכך.",action:"בחרו סעיף אחד לבחינה. זו המחשה, לא תחזית לחיסכון מובטח.",category:null});
 }
 if(!current.length)insights.push({priority:1,kind:"empty",title:"כדי לראות תובנות צריך נתונים",body:"ייבאו פירוט אשראי או הוסיפו עסקאות ידנית. תוכלו לראות התפלגות, שינויים והמלצות בדיקה.",action:"גשו ללשונית ייבוא אשראי.",category:null});
 if(prev.spent===0 && current.length)insights.push({priority:0,kind:"history",title:"השוואות ישתפרו עם הזמן",body:"אין עדיין מספיק עסקאות בחודש הקודם. שינוי בהתנהלות ניתן לזהות רק לאחר הצטברות תקופות להשוואה.",action:"אפשר לייבא גם פירוט מהחודש הקודם.",category:null});
 return {summary:c,previous:prev,insights:insights.sort((a,b)=>b.priority-a.priority).slice(0,7),comparisonLabel:isThisMonth?"עד אותו יום בחודש הקודם":"החודש הקודם"};
}
