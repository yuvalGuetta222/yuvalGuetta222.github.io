// Pure helpers for safe Cloudflare stream parsing and server-computed fallback.
// No secrets, full statements or individual transactions are passed to either helper.
const money=value=>new Intl.NumberFormat("he-IL",{
  minimumFractionDigits:0,maximumFractionDigits:2
}).format(Number(value||0))+" ₪";

function extractPart(raw){
 const parsed=JSON.parse(raw);
 if(parsed?.success===false || parsed?.error)throw Error("Cloudflare stream returned an error");
 const values=[parsed?.response,parsed?.result?.response,
  parsed?.delta?.content,parsed?.choices?.[0]?.delta?.content];
 return values.find(x=>typeof x==="string")||"";
}
export async function readWorkersAIAnswer(response,{maxChars=3500}={}){
 if(!response.ok)throw Error("Cloudflare HTTP "+response.status);
 const mime=response.headers.get("content-type")||"";
 if(!mime.includes("text/event-stream")){
  const data=await response.json();
  if(data?.success===false)throw Error("Cloudflare returned an error");
  const answer=String(data?.result?.response||data?.response||"").trim();
  if(!answer)throw Error("Cloudflare returned an empty response");
  return answer.slice(0,maxChars);
 }
 if(!response.body)throw Error("Cloudflare stream has no body");
 const reader=response.body.getReader();
 const decoder=new TextDecoder();
 let buffer="",answer="",done=false;
 const consume=packet=>{
  const data=packet.split("\n").filter(line=>line.startsWith("data:"))
   .map(line=>line.slice(5).trimStart()).join("\n").trim();
  if(!data)return;
  if(data==="[DONE]"){done=true;return;}
  try{
   answer+=extractPart(data);
  }catch(error){
   if(error instanceof SyntaxError)throw Error("Invalid Cloudflare stream event");
   throw error;
  }
  if(answer.length>maxChars*4)throw Error("Cloudflare output exceeded safety limit");
 };
 try{
  while(!done){
   const {value,done:ended}=await reader.read();
   if(ended){
    buffer+=decoder.decode();
    break;
   }
   buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
   if(buffer.length>64000)throw Error("Cloudflare stream buffer exceeded safety limit");
   let boundary;
   while((boundary=buffer.indexOf("\n\n"))!==-1){
    const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
    consume(event);
    if(done)break;
   }
  }
  if(!done && buffer.trim())consume(buffer);
  if(!answer.trim())throw Error("Cloudflare stream returned no text");
  return answer.trim().slice(0,maxChars);
 }finally{
  try{await reader.cancel()}catch{}
  reader.releaseLock();
 }
}
const evidenceWarning=context=>{
 const c=context?.evidence?.current||{};
 if(c.mismatched_statement_count>0)
  return "בחודש הנבחר זוהו פערים בדוחות המקור. חשוב לוודא את התאמת הדוחות לפני שמסתמכים על הסכומים.";
 if(c.no_source_total_count>0)
  return "לא לכל הדוחות יש סכום מקור לאימות, לכן לא ניתן לאשר שהנתונים מלאים.";
 if(context?.current_month_is_incomplete)
  return "החודש עדיין לא הסתיים, ולכן ההוצאות אינן מייצגות בהכרח חודש מלא.";
 return "הנתונים משקפים רק תנועות שדווחו ונקלטו, ולא יתרת חשבון בנק.";
};

export const builtInQuestionPrompts=Object.freeze({
 summary:"סכם בקצרה את מצב החודש שבחרתי, על בסיס סכומי ההכנסות וההוצאות שנרשמו, וציין מגבלות מהימנות.",
 saving:"איפה יש הזדמנויות מעשיות לבדוק חיסכון החודש? השתמש רק בחריגות ונתונים מבוססים ואל תבטיח סכום חיסכון.",
 compare:"מה השתנה בהוצאות לעומת החודש הקודם? התייחס לסכומים לפי קטגוריות רק אם ההשוואה אמינה; אם לא, הסבר למה.",
 budget:"באילו קטגוריות חרגנו מהתקציב ומה גובה החריגה בשקלים? אם לא הוגדר תקציב, אמור זאת.",
 remaining:"כמה נשאר מתקציבי הקטגוריות שהוגדרו לחודש הנבחר? ציין חריגות ואל תניח שהנתונים מלאים.",
 top:"אילו שלוש קטגוריות אחראיות להוצאות הגבוהות ביותר בחודש ומה הסכומים שלהן?",
 cashflow:"איך נראות ההכנסות שהתקבלו מול חיובי האשראי וההוצאות הידניות שנרשמו? הבהר שאין כאן יתרת בנק או הוצאות קבועות לא מקושרות.",
 priorities:"איזה שלוש פעולות כדאי לבדוק ראשונות כדי לשפר את ההתנהלות הכלכלית, לפי הראיות שנאספו?",
 data_quality:"עד כמה נתוני החודש אמינים? האם יש דוחות שלא אומתו, פערים או חודשים חלקיים שמגבילים את המסקנות?"
});
const lineItems=(items,max=4)=>items.slice(0,max).map((s,i)=>String(i+1)+". "+s);
const differenceWarning=comparison=>{
 const status=comparison?.status;
 if(status==="source_discrepancy")return "לא ניתן להשוות באופן אמין: נמצאו הפרשים בבדיקת דוחות המקור.";
 if(status==="unverified_source_totals")return "לא ניתן לאמת השוואה: לחלק מהדוחות לא קיים סכום מקור לבדיקה.";
 if(status==="current_month_partial")return "החודש הנבחר עדיין בעיצומו; אין להשוות אותו כחודש מלא לחודש קודם.";
 return "אין עדיין נתונים מלאים או מאומתים בשני החודשים כדי להשוות מגמה.";
};

export function builtInFallback(context,type){
 if(!Object.hasOwn(builtInQuestionPrompts,type))return null;
 const current=context.current||{},cats=current.largest_spending_categories||[];
 const comparisons=context.comparison||{},budgets=context.budgets||[];
 const month=context.selected_month||"החודש הנבחר";
 const warning=evidenceWarning(context);
 if(type==="compare"){
  const lines=["השוואת הוצאות עבור "+month+" לעומת "+(context.previous_month||"החודש הקודם")+":"];
  if(!comparisons.reliable_full_month_comparison){
   lines.push(differenceWarning(comparisons));
  }else{
   lines.push("ההוצאות שנרשמו בחודש הנבחר: "+money(current.recorded_card_and_manual_spending_ils)+
    "; בחודש הקודם: "+money(context.previous?.recorded_card_and_manual_spending_ils)+".");
   const delta=comparisons.spending_change_ils||0;
   lines.push(delta===0?"לא נמצא שינוי בסכום ההוצאות המתועדות.":
    (delta>0?"עלייה":"ירידה")+" של "+money(Math.abs(delta))+
    (comparisons.spending_change_percent===null?"":" ("+Math.abs(comparisons.spending_change_percent)+"%)")+".");
   const changes=(comparisons.category_changes_for_reference_only||[]).slice(0,3)
    .map(x=>x.category+": "+(x.change_ils>0?"עלייה":"ירידה")+" של "+money(Math.abs(x.change_ils)));
   lines.push(...changes);
  }
  lines.push(warning);
  return lines.join("\n");
 }
 if(type==="budget"){
  if(!budgets.length)return "לא הוגדרו תקציבי קטגוריות לחודש "+month+". הגדירו תקציבים כדי לזהות חריגות.\n"+warning;
  const overruns=budgets.filter(b=>b.over_budget_ils>0);
  const lines=["חריגות מתקציב עבור "+month+":"];
  if(!overruns.length)lines.push("לא זוהו חריגות בתקציבים שהוגדרו, לפי החיובים שנקלטו.");
  else lines.push(...lineItems(overruns.map(b=>b.category+": חריגה של "+money(b.over_budget_ils)+
   " (תקציב "+money(b.limit_ils)+", הוצאות שנקלטו "+money(b.spent_ils)+").")));
  lines.push(warning);
  return lines.join("\n");
 }
 if(type==="remaining"){
  if(!budgets.length)return "אין תקציבי קטגוריות מוגדרים לחודש "+month+", ולכן אי אפשר לחשב כמה נותר בכל קטגוריה.\n"+warning;
  const lines=["מצב תקציבים לחודש "+month+":"];
  lines.push(...lineItems(budgets.slice(0,5).map(b=>
   b.category+": "+(b.remaining_ils<0?"חריגה של "+money(-b.remaining_ils):
    "יתרה תקציבית מחושבת של "+money(b.remaining_ils))+
   " מתוך תקציב של "+money(b.limit_ils)+"."
  ),5));
  lines.push("היתרות הן מול חיובים שנקלטו בלבד, ואינן כסף פנוי בבנק.",warning);
  return lines.join("\n");
 }
 if(type==="top"){
  if(!cats.length||!(current.transaction_count>0))return "אין מספיק עסקאות שנקלטו בחודש "+month+" כדי לזהות קטגוריות מובילות.\n"+warning;
  const lines=["הקטגוריות עם סכומי ההוצאה הגבוהים ביותר בחודש "+month+":"];
  lines.push(...lineItems(cats.filter(x=>x.spending_ils>0).slice(0,3).map(c=>
   c.category+": "+money(c.spending_ils)+(c.share_percent===null?"":" ("+c.share_percent+"% מההוצאות המתועדות)"))));
  lines.push(warning);return lines.join("\n");
 }
 if(type==="cashflow"){
  const lines=["הכנסות מול הוצאות מתועדות עבור "+month+":"];
  lines.push("הכנסות שסומנו כהתקבלו: "+money(current.received_income_ils)+".");
  lines.push("חיובי אשראי והוצאות ידניות שנקלטו נטו לאחר זיכויים: "+money(current.recorded_card_and_manual_spending_ils)+".");
  lines.push("אלו אינם כל הוצאות משק הבית: התחייבויות קבועות שלא קושרו לעסקאות אינן כלולות, ולכן אי אפשר להסיק מכך כמה כסף פנוי יש בחשבון.");
  lines.push(warning);return lines.join("\n");
 }
 if(type==="data_quality"){
  const a=context.evidence?.current||{},b=context.evidence?.previous||{};
  const lines=["בדיקת איכות הנתונים עבור "+month+":"];
  if(context.date_basis==="statement")lines.push("נקלטו "+(a.statement_count||0)+" דוחות עם חודש חיוב מזוהה.");
  if(a.mismatched_statement_count>0)lines.push("זוהו "+a.mismatched_statement_count+" דוחות שבהם סכום המקור שונה מהעסקאות שנקלטו. סך ההפרשים המוחלטים: "+money(a.mismatch_total_absolute_ils)+".");
  if(a.no_source_total_count>0)lines.push("ב-"+a.no_source_total_count+" דוחות אין סכום מקור זמין לאימות.");
  if(!a.mismatched_statement_count&&!a.no_source_total_count&&a.statement_count>0)
   lines.push("לא נמצאו פערים בדוחות שיש להם סכום מקור, אך אין בכך הוכחה שכל החשבונות דווחו.");
  if(!current.transaction_count)lines.push("לא נקלטו עסקאות בחודש הנבחר. אין להסיק מכך שלא היו הוצאות.");
  if(context.current_month_is_incomplete)lines.push("החודש עדיין לא הסתיים.");
  if(!comparisons.reliable_full_month_comparison)lines.push("השוואה לחודש קודם אינה מאומתת: "+differenceWarning(comparisons));
  if(b.mismatched_statement_count>0)lines.push("קיימים גם פערים בדוחות של החודש הקודם.");
  if(lines.length===1)lines.push("אין מספיק מידע לבדיקת שלמות הדוחות.");
  lines.push("אי אפשר להסיק מכך התאמה לחשבון הבנק.");
  return lines.join("\n");
 }
 if(type==="priorities"){
  const lines=["שלוש בדיקות בעדיפות עבור "+month+":"],actions=[];
  const evidence=context.evidence?.current||{};
  if(evidence.mismatched_statement_count>0)
   actions.push("בדקו את פערי ההתאמה ב-"+evidence.mismatched_statement_count+" דוחות לפני קבלת החלטות.");
  else if(evidence.no_source_total_count>0)
   actions.push("השלימו אימות סכומי מקור ב-"+evidence.no_source_total_count+" דוחות.");
  const over=budgets.filter(b=>b.over_budget_ils>0);
  for(const b of over){
   if(actions.length===3)break;
   actions.push("בדקו את קטגוריית "+b.category+" שבה נרשמה חריגה של "+money(b.over_budget_ils)+".");
  }
  if(comparisons.reliable_full_month_comparison){
   const used=new Set(over.map(b=>b.category));
   for(const c of comparisons.category_changes_for_reference_only||[]){
    if(actions.length===3)break;
    if(c.change_ils>0&&c.previous_ils>0&&!used.has(c.category)){
     actions.push("בדקו את הגידול בקטגוריית "+c.category+" ("+money(c.change_ils)+").");
     used.add(c.category);
    }
   }
  }
  if(actions.length<3&&cats.length&&current.transaction_count>0)
   actions.push("עברו על קטגוריית "+cats[0].category+" ("+money(cats[0].spending_ils)+"), שהיא מהגדולות בהוצאות המתועדות.");
  if(actions.length<3&&!budgets.length)actions.push("הגדירו תקציבים לקטגוריות עיקריות לצורך מעקב.");
  if(!actions.length)actions.push("השלימו נתוני הכנסות ודוחות לפני קביעת יעדי חיסכון.");
  lines.push(...lineItems(actions,3));lines.push(warning,"אלו בדיקות מוצעות, לא חיסכון כספי מובטח.");
  return lines.join("\n");
 }
 if(type==="summary"){
  const fragments=[
   "סיכום נתונים מחושב עבור "+month+":",
   "נרשמו "+(current.transaction_count||0)+" עסקאות, והוצאה נטו של "+
    money(current.recorded_card_and_manual_spending_ils)+".",
   "הכנסות שסומנו כהתקבלו: "+money(current.received_income_ils)+"."
  ];
  if(cats.length&&current.transaction_count>0)
   fragments.push("הקטגוריה הגדולה ביותר: "+cats[0].category+" ("+money(cats[0].spending_ils)+").");
  if(comparisons.reliable_full_month_comparison&&comparisons.spending_change_ils!==null){
   const delta=comparisons.spending_change_ils;
   fragments.push("לעומת החודש הקודם: "+
    (delta>0?"עלייה":delta<0?"ירידה":"ללא שינוי")+" של "+money(Math.abs(delta))+" בהוצאות המתועדות.");
  }
  fragments.push(warning);
  return fragments.join("\n");
 }
 const fragments=["אפשרויות לבדיקה ולצמצום הוצאות עבור "+month+":"];
 const over=budgets.filter(b=>b.over_budget_ils>0).slice(0,2);
 over.forEach(b=>fragments.push("• "+b.category+": חריגה של "+
  money(b.over_budget_ils)+" מהתקציב שהוגדר. כדאי לעבור על ההוצאות בקטגוריה זו."));
 if(over.length<3&&comparisons.reliable_full_month_comparison){
  const rises=(comparisons.category_changes_for_reference_only||[])
   .filter(c=>c.change_ils>0&&c.previous_ils>0&&!over.some(b=>b.category===c.category));
  rises.slice(0,3-over.length).forEach(c=>fragments.push("• "+c.category+
   ": ההוצאות עלו ב-"+money(c.change_ils)+
   " ביחס לחודש הקודם. בדקו אם השינוי צפוי או ניתן לצמצום."));
 }
 if(fragments.length===1){
  if(cats.length&&current.transaction_count>0)fragments.push(
   "• "+cats[0].category+" היא הקטגוריה הגדולה ביותר ("+
   money(cats[0].spending_ils)+"). כדאי לבדוק אילו רכישות בה היו חיוניות.");
  else fragments.push("אין מספיק הוצאות מתועדות כדי להצביע על קטגוריה מסוימת. כדאי להשלים נתונים לפני קבלת החלטות.");
  if(!budgets.length)fragments.push("• הגדירו תקציב חודשי לקטגוריות משמעותיות כדי לזהות חריגות בעתיד.");
 }
 fragments.push(warning,"אלו כיוונים לבדיקה, לא חיסכון מובטח.");
 return fragments.join("\n");
}
