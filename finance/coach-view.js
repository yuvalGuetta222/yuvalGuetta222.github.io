import {householdBalance} from "./household-ledger.mjs";
import {ils,shiftMonth,spendingForecast,savingsPriorities,recurringSignals,installmentSignals} from "./coach-engine.mjs";
const $=id=>document.getElementById(id);
let runtime=null,seq=0;
const node=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==null&&value!==undefined)e.textContent=String(value);if(cls)e.className=cls;return e};
function textOrEmpty(holder,items,empty){holder.replaceChildren(...(items.length?items:[node("p",empty,"empty")]))}
const typeLabel=x=>x==="medium"?"בינונית":x==="low"?"נמוכה":"לא זמינה";
function showForecast(result,ledger){
 $("forecast-actual").textContent=ils(result.actual);
 $("forecast-rest").textContent=result.projectedRemaining===null?"אין נתונים מספיקים":ils(result.projectedRemaining);
 $("forecast-end").textContent=result.projectedTotal===null?"לא ניתן להעריך":ils(result.projectedTotal);
 $("forecast-confidence").textContent="רמת ביטחון: "+typeLabel(result.confidence);
 $("forecast-confidence").className="financial-confidence "+result.confidence;
 $("forecast-planned").textContent=ils(ledger.unmatched)+" מתוך "+ils(ledger.planned)+" מתוכננים (לא כולל "+ils(ledger.matched)+" שכבר קושרו לעסקאות)";
 $("forecast-range").textContent=result.lower!==null?"טווח המחשה: "+ils(result.lower)+" עד "+ils(result.upper)+" • "+result.remainingDays+" ימים נותרו בחודש":"";
 $("forecast-with-fixed").textContent="כדי להבין מה נשאר לתכנון, היתרה במסך הראשי מפחיתה גם "+ils(ledger.unmatched)+" מהתחייבויות קבועות שאינן כלולות בעסקאות. לא מצרפים סכום זה לתחזית חיובים עתידיים באופן אוטומטי כדי להימנע מספירה כפולה.";
 const explanation=$("forecast-warning");explanation.replaceChildren();
 explanation.append(node("p",result.reason||"אין מספיק נתונים.","coach-disclaimer"));
 if(result.lagDays>3)explanation.append(node("p","העסקה האחרונה בדוח מתוארכת לפני "+result.lagDays+" ימים. ייתכנו הוצאות שטרם יובאו, ולכן אין להתייחס לאומדן כאל יתרה פנויה.","coach-disclaimer"));
}
function showPriorities(result){
 const holder=$("coach-priorities");holder.replaceChildren();
 for(const [index,p] of result.entries()){
  const card=node("article",null,"coach-priority");
  const title=node("div",null,"coach-priority-title");
  title.append(node("span",String(index+1),"priority-index"),node("b",p.category));
  const why=node("p",p.reason+" • "+p.basis,"coach-priority-basis");
  const estimated=p.saving>0?"תרחיש חיסכון אפשרי: "+ils(p.saving)+" בחודש.":"יש לבדוק את העסקאות לפני שמעריכים חיסכון.";
  card.append(title,why,node("small",p.confidence,"coach-confidence"),node("p",estimated+" "+p.action,"coach-priority-action"));
  holder.append(card);
 }
 if(!result.length)holder.append(node("p","אין עדיין מספיק נתונים כדי לדרג שלוש הזדמנויות אמינות. אפשר להגדיר תקציבים ולהוסיף פירוט של חודש קודם.","empty"));
}
function showRecurring({installments,recurring}){
 const bill=$("coach-installments");bill.replaceChildren();
 bill.append(node("h3","עסקאות בתשלומים"));
 if(installments.length){
  bill.append(node("p","מוצגות רק עסקאות שבקובץ שלהן הופיע מספר תשלום ומספר תשלומים כולל.","note"));
  for(const t of installments.slice(0,8)){
   const row=node("div",null,"coach-charge");
   const d=node("div",null,"charge-detail");d.append(node("b",t.merchant),node("small","תשלום "+t.number+" מתוך "+t.total+" • עוד "+t.futurePayments+" תשלומים משוערים"));
   const val=node("div",null,"charge-value");val.append(node("b",ils(t.amount)),node("small","אומדן יתרה: "+ils(t.futureAmount)));
   row.append(d,val);bill.append(row);
  }
 }else bill.append(node("p","אין בקבצים שנשמרו מידע מפורש על עסקאות בתשלומים. בדוחות חדשים עם עמודות תשלומים יופיעו כאן החיובים.","empty"));
 const sub=$("coach-recurring");sub.replaceChildren();
 sub.append(node("h3","חיובים חוזרים אפשריים"));
 if(recurring.length){
  sub.append(node("p","הסכומים חוזרים בכמה חודשים, אך זו אינה הוכחה למנוי. לא מוסיפים אותם שוב להוצאות.","note"));
  for(const t of recurring.slice(0,8)){
   const row=node("div",null,"coach-charge");
   const d=node("div",null,"charge-detail");d.append(node("b",t.merchant),node("small","תשלום דומה ב-"+t.months.length+" חודשים • אינדיקציה "+(t.confidence==="medium"?"בינונית":"חלשה")));
   row.append(d,node("b",ils(t.amount),"charge-value"));sub.append(row);
  }
 }else sub.append(node("p","לא נמצאו עדיין חיובים דומים מספיק בכמה חודשים. המערכת תזהה אותם לאחר ייבוא תקופות נוספות.","empty"));
}
async function fetchPast(month,household){
 const from=shiftMonth(month,-3)+"-01",to=month+"-01",all=[];
 for(let offset=0;offset<6000;offset+=1000){
  const {data,error}=await runtime.supabase.from("tevuna_transactions")
   .select("id,occurred_on,merchant,category,amount_agorot,entry_kind,installment_number,installment_total")
   .eq("household_id",household).gte("occurred_on",from).lt("occurred_on",to)
   .order("occurred_on",{ascending:true}).order("id",{ascending:true}).range(offset,offset+999);
  if(error)throw error;
  all.push(...(data||[]));
  if(!data||data.length<1000)return all;
 }
 throw new Error("כמות העסקאות גדולה מדי לניתוח מלא. ייבאו תקופות קצרות יותר.");
}
export function setupCoach(context){
 runtime=context;
 document.addEventListener("tevuna:loaded",async e=>{
  const {data,month,household}=e.detail||{};
  if(!data||!household)return;
  const thisRequest=++seq;
  const now=new Date();
  const ledger=householdBalance({incomes:data.income,transactions:data.transactions,fixed:data.fixed,coverage:data.coverage});
  const fallback=spendingForecast({month,now,current:data.transactions,fixed:data.fixed,history:[]});
  if($("date-basis").value!=="transaction"){
   showForecast({...fallback,confidence:"unavailable",projectedRemaining:null,projectedTotal:null,lower:null,upper:null,reason:"התחזית, התשלומים והמנויים מבוססים על תאריך העסקה. עבורם עברו למצב ׳לפי תאריך עסקה׳."},ledger);
   showPriorities([]);showRecurring({installments:[],recurring:[]});
   $("coach-status").textContent="במצב חודש חיוב מוצגים חיובים מתועדים בלבד. ניתוח מגמות התנהגות זמין לפי תאריך עסקה.";
   return;
  }
  showForecast(fallback,ledger);showPriorities([]);showRecurring({installments:installmentSignals(data.transactions,month),recurring:[]});
  $("coach-status").textContent="בודק היסטוריה והשוואות…";
  try{
   const past=await fetchPast(month,household);
   if(thisRequest!==seq||runtime.getContext().household!==household||$("month").value!==month)return;
   const forecast=spendingForecast({month,now,current:data.transactions,history:past,fixed:data.fixed});
   const previous=past.filter(t=>String(t.occurred_on).startsWith(shiftMonth(month,-1)));
   const priorities=savingsPriorities({month,now,current:data.transactions,previous,budgets:data.budgets});
   const recur=recurringSignals([...past,...data.transactions],month);
   const installments=installmentSignals(data.transactions,month);
   showForecast(forecast,ledger);showPriorities(priorities);showRecurring({installments,recurring:recur});
   $("coach-status").textContent="";
  }catch(error){
   if(thisRequest!==seq)return;
   $("coach-status").textContent="ניתוח ההיסטוריה אינו זמין כרגע: "+String(error.message||error).slice(0,130)+". הסכומים שכבר נרשמו ממשיכים להופיע.";
  }
 });
}
