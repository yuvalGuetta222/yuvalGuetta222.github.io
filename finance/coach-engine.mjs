/* Transparent spending projections, guidance and recurring-charge signals.
   All monetary amounts are INTEGER AGOROT, with no AI or bank feed. */
export const ils=n=>new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0}).format((Number(n)||0)/100);
const sign=t=>t.entry_kind==="refund"?-1:1;
export function monthKey(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0")].join("-")}
export function shiftMonth(month,delta){const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+delta,1);return monthKey(d)}
export function monthLength(month){const [y,m]=month.split("-").map(Number);return new Date(y,m,0).getDate()}
export function aggregateTransactions(rows){
 return (rows||[]).reduce((sum,t)=>sum+sign(t)*(Number(t.amount_agorot)||0),0);
}
function datesOf(rows){const x=(rows||[]).map(t=>String(t.occurred_on||"")).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x));return {first:x.sort()[0]||null,last:x.at(-1)||null,days:new Set(x).size}}
function historicalCoverage(rows,month){
 const matching=rows.filter(t=>String(t.occurred_on||"").slice(0,7)===month);
 if(matching.length<12)return false;
 const ds=datesOf(matching),min=Number(ds.first?.slice(-2)),max=Number(ds.last?.slice(-2));
 return ds.days>=9&&min<=7&&max>=monthLength(month)-6;
}
const fixedMonthlyAmount=x=>{
 const cadence={monthly:1,bimonthly:2,quarterly:3,yearly:12}[x.cadence]||1;
 return Math.round((Number(x.amount_agorot)||0)/cadence);
};
export function spendingForecast({month,now=new Date(),current=[],history=[],fixed=[]}){
 const spent=aggregateTransactions(current);
 const planned=(fixed||[]).filter(x=>x.active).reduce((s,x)=>s+fixedMonthlyAmount(x),0);
 const active=month===monthKey(now),totalDays=monthLength(month);
 const today=Math.min(now.getDate(),totalDays),remaining=active?Math.max(0,totalDays-today):0;
 const ds=datesOf(current);
 const lastDay=ds.last?Number(ds.last.slice(-2)):0;
 const lag=active?today-lastDay:0;
 const base={
   actual:spent,plannedMonthlyReference:planned,plannedIncludedInForecast:false,
   month,remainingDays:remaining,lagDays:active?lag:null,historyMonths:0,
   projectedRemaining:null,projectedTotal:null,lower:null,upper:null,confidence:"unavailable",reason:""
 };
 if(!active){return {...base,reason:"תחזית סוף חודש זמינה רק לחודש הנוכחי. הנתונים לחודש שנבחר הם חיובים שנשמרו בפועל."}}
 if(remaining===0)return {...base,projectedRemaining:0,projectedTotal:spent,lower:spent,upper:spent,confidence:ds.days>=5?"medium":"low",reason:"החודש הסתיים. מוצגים חיובים שנרשמו עד היום, לא יתרת בנק."};
 if(current.length===0)return {...base,reason:"טרם נטענו עסקאות לחודש הנוכחי. לא ניתן להפיק תחזית מהימנה."};
 if(lag>7)return {...base,reason:"העסקאות האחרונות בקובץ מתוארכות לפני "+lag+" ימים. יש לייבא פירוט עדכני לפני חיזוי שאר החודש."};
 const past=[];
 for(let i=1;i<=3;i++){
  const prev=shiftMonth(month,-i);
  const items=history.filter(t=>String(t.occurred_on||"").slice(0,7)===prev);
  if(historicalCoverage(items,prev))past.push(aggregateTransactions(items)/monthLength(prev));
 }
 const coveredCurrent=ds.days>=5&&lastDay>=Math.max(6,today-7);
 if(!past.length&&!coveredCurrent)return {...base,reason:"אין מספיק ימי עסקאות או חודשים קודמים מלאים כדי לחשב מגמה בלי להטעות."};
 const elapsed=Math.max(today,1);
 const currentPace=Math.max(0,spent)/elapsed;
 const historicDaily=past.length?past.reduce((a,b)=>a+b,0)/past.length:0;
 const rate=past.length?(0.65*historicDaily+0.35*currentPace):currentPace;
 const projectedRemaining=Math.max(0,Math.round(rate*remaining));
 let confidence=(!past.length||!coveredCurrent)?"low":past.length>=2&&lag<=3?"medium":"low";
 // Complete-ish previous months are not evidence of bank data completeness, so never label 'high'.
 const factor=confidence==="medium"?0.20:0.40;
 const lower=spent+Math.max(0,Math.round(projectedRemaining*(1-factor)));
 const upper=spent+Math.max(0,Math.round(projectedRemaining*(1+factor)));
 return {...base,historyMonths:past.length,confidence,projectedRemaining,projectedTotal:spent+projectedRemaining,lower,upper,
 reason:confidence==="medium"?"אומדן המבוסס על קצב החיובים עד היום ועל חודשים קודמים עם כיסוי רחב.":"אומדן ראשוני בקירוב; חסרה היסטוריה רחבה להשוואה. הטווח נועד להמחיש אי־ודאות."};
}
export function merchantKey(value){
 return String(value??"").normalize("NFKC").toLowerCase().replace(/[\u200e\u200f]/g,"")
   .replace(/[.,:;'"״׳_\/\\()\-]/g," ").replace(/\s+/g," ").trim();
}
export function recurringSignals(transactions,month){
 const pastMonths=[shiftMonth(month,-2),shiftMonth(month,-1),month];
 const grouped=new Map();
 for(const t of transactions||[]){
  if(t.entry_kind==="refund"||t.installment_total>1)continue;
  const mo=String(t.occurred_on||"").slice(0,7),key=merchantKey(t.merchant);
  if(!pastMonths.includes(mo)||key.length<3||Number(t.amount_agorot)<=0)continue;
  if(!grouped.has(key))grouped.set(key,new Map());
  const byMonth=grouped.get(key);
  if(!byMonth.has(mo))byMonth.set(mo,[]);
  byMonth.get(mo).push(t);
 }
 const found=[];
 for(const [key,months] of grouped){
  if(months.size<2 || [...months.values()].some(rows=>rows.length!==1))continue;
  const samples=[...months.values()].map(rows=>Number(rows[0].amount_agorot));
  const lowest=Math.min(...samples),highest=Math.max(...samples);
  if((highest-lowest)/Math.max(1,lowest)>.08)continue;
  const newest=months.get(month)?.[0]||[...months.values()].at(-1)?.[0];
  const seen=[...months.keys()].sort();
  const adjacent=seen.some((m,i)=>i>0&&shiftMonth(seen[i-1],1)===m);
  if(!adjacent)continue;
  found.push({merchant:newest.merchant,amount:Math.round(samples.reduce((a,b)=>a+b,0)/samples.length),
    months:seen,category:newest.category,confidence:months.size>=3?"medium":"low",
    title:"חיוב חוזר אפשרי",detail:"חיוב דומה מופיע ב-"+months.size+" חודשים. ייתכן מנוי או הוצאה קבועה, אך אין אישור לכך ממקור החיוב."});
 }
 return found.sort((a,b)=>b.amount-a.amount).slice(0,12);
}
export function installmentSignals(transactions,month){
 const current=(transactions||[]).filter(x=>String(x.occurred_on||"").slice(0,7)===month &&
   Number.isInteger(x.installment_total)&&Number.isInteger(x.installment_number)&&x.installment_total>1 &&
   x.installment_number>=1&&x.installment_number<=x.installment_total&&x.entry_kind!=="refund");
 return current.map(x=>({
   merchant:x.merchant,amount:Number(x.amount_agorot),number:x.installment_number,total:x.installment_total,
   futurePayments:x.installment_total-x.installment_number,
   futureAmount:(x.installment_total-x.installment_number)*Number(x.amount_agorot),
   disclaimer:"אומדן תשלומים עתידיים בהנחה שסכום התשלום הבא זהה. אינו נכלל מחדש בהוצאות החודש."
 })).sort((a,b)=>b.futureAmount-a.futureAmount);
}
const FLEXIBLE=[/מסעד|בתי קפה|אוכל בחוץ|משלוח|וולט|wolt/i,/פנאי|בידור|ספורט|בילוי|הופעות|אירוע/i,/קניות|בגדים|אופנה|shopping/i,/נופש|חופשה|טיול/i];
function discretionary(label){return FLEXIBLE.some(x=>x.test(label))}
export function savingsPriorities({month,now=new Date(),current=[],previous=[],budgets=[],recurring=[]}){
 const groups=new Map();
 for(const t of current){
  const name=String(t.category||"אחר");
  groups.set(name,(groups.get(name)||0)+sign(t)*(Number(t.amount_agorot)||0));
 }
 const old=new Map();
 const sameMonth=month===monthKey(now);
 for(const t of previous){
  if(sameMonth&&Number(String(t.occurred_on||"").slice(-2))>now.getDate())continue;
  const name=String(t.category||"אחר");old.set(name,(old.get(name)||0)+sign(t)*(Number(t.amount_agorot)||0));
 }
 const budgetBy=new Map(budgets.map(b=>[b.category,Number(b.amount_agorot)]));
 const previousCoverage=historicalCoverage(previous,shiftMonth(month,-1));
 const proposals=[];
 for(const [category,value] of groups){
  if(value<=0)continue;
  const budget=budgetBy.get(category),isFlex=discretionary(category);
  const prev=old.get(category);
  if(budget!==undefined&&value>budget){
   proposals.push({category,reason:"חריגה מתקציב",priority:3,confidence:"גבוהה בזיהוי החריגה",basis:"הוצאה: "+ils(value)+" מול מסגרת "+ils(budget),
     saving:Math.min(Math.max(0,value-budget),Math.round(value*.15)),action:"בדקו את העסקאות בקטגוריה, ואז החליטו אם ניתן לצמצם הוצאה דומה בחודש הבא."});
  }else if(previousCoverage&&prev>0&&value>prev*1.25&&value-prev>=20000){
   proposals.push({category,reason:"עלייה לעומת חודש קודם",priority:2,confidence:"בינונית; תלוי בשלמות הדוחות",basis:"עלייה של "+ils(value-prev)+" מול התקופה המקבילה",
     saving:isFlex?Math.round(value*.1):0,action:"בדקו מה גרם לעלייה, במיוחד חיוב חד־פעמי או שינוי במועד החיוב."});
  }else if(isFlex&&value>=20000){
   proposals.push({category,reason:"תחום גמיש לבדיקה",priority:1,confidence:"נמוכה; תרחיש בלבד",basis:"הוצאה מדווחת: "+ils(value),
     saving:Math.round(value*.1),action:"בדקו אפשרות לצמצום תיאורטי של 10% בחודש הבא, רק אם זה מתאים לצרכים שלכם."});
  }
 }
 return proposals.sort((a,b)=>b.priority-a.priority||b.saving-a.saving).slice(0,3);
}
