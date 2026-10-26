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
export function builtInFallback(context,type){
 if(type!=="summary"&&type!=="saving")return null;
 const current=context.current||{},cats=current.largest_spending_categories||[];
 const comparisons=context.comparison||{},budgets=context.budgets||[];
 const month=context.selected_month||"החודש הנבחר";
 const warning=evidenceWarning(context);
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
