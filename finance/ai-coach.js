// Cloudflare AI credentials are configured on the secure Supabase server only.
let authenticated=false;
let providerReady=false;
let inFlight=false;
const $=id=>document.getElementById(id);
function message(who,content){
 const root=$("ai-conversation");
 if(root.querySelector(".empty"))root.replaceChildren();
 const wrap=document.createElement("article");
 wrap.className="ai-message "+(who==="ai"?"from-ai":"from-user");
 const head=document.createElement("strong");
 head.textContent=who==="ai"?"✦ תבונה AI":"שאלה";
 const body=document.createElement("p");body.textContent=String(content);
 wrap.append(head,body);root.append(wrap);
 wrap.scrollIntoView?.({behavior:"smooth",block:"nearest"});
}
function status(text){$("ai-feedback").textContent=String(text||"");}
function setBusy(value){
 inFlight=value;
 document.querySelectorAll("[data-ai-task]").forEach(b=>b.disabled=value);
 $("ai-ask").disabled=value;
}
function getError(result){
 const server=result?.context?.body;
 if(server?.error)return String(server.error);
 return "הקריאה לשירות ה-AI נכשלה. בדקו את חיבור Cloudflare ב-Supabase.";
}
export function setupAICoach(runtime){
 const context=runtime;
 async function refreshStatus(){
  const {user,household}=runtime.getContext();
  if(!user||!household){authenticated=false;providerReady=false;return false}
  authenticated=true;
  const {data,error}=await runtime.supabase.functions.invoke("tevuna-ai-coach",{body:{type:"status"}});
  if(error){
   providerReady=false;
   $("ai-connection-status").textContent="שירות AI אינו זמין. השאלות לא יישלחו עד שהחיבור יאומת.";
   return false;
  }
  providerReady=!!data?.ready;
  const configured=!!data?.configured||providerReady;
  const statusText=providerReady?
   "✓ טוקן Cloudflare פעיל. ניתן לנסות ניתוח כדי לבדוק את הרשאות המודל.":
   data?.code==="CLOUDFLARE_TOKEN_FORMAT"?
    "⚠ טוקן Cloudflare נשמר בפורמט לא תקין. בסודות Supabase יש לשמור רק את ערך הטוקן, בלי Bearer, מרכאות או רווחים.":
   data?.code==="CLOUDFLARE_TOKEN_INVALID"?
    "⚠ הטוקן נשמר אבל נדחה על ידי Cloudflare. יש לבדוק הרשאות Workers AI ולהפיק טוקן חדש במקרה הצורך.":
   data?.code==="CLOUDFLARE_UNREACHABLE"?
    "⚠ פרטי Cloudflare שמורים, אבל אימות הטוקן נכשל. "+
    (data?.diagnostic==="EDGE_OUTBOUND_NETWORK_FAILURE"?
      "נמצאה בעיית תקשורת כללית ביציאה משרת Supabase. אין צורך לשנות את הטוקן.":
     data?.diagnostic==="CLOUDFLARE_HOST_UNREACHABLE"?
      "שרת Supabase מגיע לאינטרנט אבל לא לשרת Cloudflare. אין צורך להגדיר את הטוקן מחדש.":
     data?.diagnostic==="CREDENTIAL_REQUEST_FAILED"?
      "החיבור הציבורי ל-Cloudflare עובד, אבל הקריאה המאומתת נכשלה. צריך לבדוק את פרטי הטוקן והרשאותיו.":
      data?.reason==="INVALID_HEADER"?
      "זוהתה בעיית כותרת אימות.":"עדיין לא זוהתה הסיבה המדויקת.")+
     " קוד אבחון: "+String(data?.diagnostic||data?.reason||"UNKNOWN")+".":
   "יועץ Cloudflare Workers AI מותקן, אך טרם חובר לחשבון Cloudflare.";
  $("ai-connection-status").textContent=statusText;
  $("ai-key-setup").hidden=configured&&data?.code!=="CLOUDFLARE_TOKEN_FORMAT";
  return configured&&data?.code!=="CLOUDFLARE_TOKEN_FORMAT"; }
 async function ask(type,question=""){
  if(inFlight)return;
  const {user,household}=context.getContext();
  if(!authenticated||!user||!household){status("יש להתחבר לחשבון המשפחתי.");return}
  const month=$("month").value,basis=$("date-basis").value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){status("בחרו חודש תקין.");return}
  if(type==="question"&&(!question.trim()||question.length>400)){status("כתבו שאלה עד 400 תווים.");return}
  if(!await refreshStatus()){
   status("יועץ AI עדיין לא מחובר ל-Cloudflare. הגדירו את פרטי החיבור בסודות Supabase ואז רעננו את האתר. לא נשלחה בקשה לניתוח ולא שונו נתונים.");
   return;
  }
  if(type==="question")message("user",question);
  else message("user",type==="summary"?"סכם את המצב הפיננסי בחודש הנבחר":"איפה אפשר לחסוך החודש?");
  setBusy(true);status("מנתח נתוני תקציב מסוכמים... לא שולח את דוחות האשראי הגולמיים.");
  try{
   const opts={body:{type,question,month,basis,household}};
   const {data,error}=await context.supabase.functions.invoke("tevuna-ai-coach",opts);
   if(error){
    let actual=data;
    if(!actual&&error?.context?.json)try{actual=await error.context.json()}catch{}
    throw Error(actual?.error||getError({context:error?.context}));
   }
   if(!data?.answer)throw Error(data?.error||"שירות ה-AI לא החזיר תשובה");
   message("ai",data.answer);
   if(data.uncertain)status("התגובה כוללת הסתייגות: בחודש הנבחר קיימים פערים בין חלק ממקורות האשראי.");
   else status("הניתוח הושלם. סכומי היסוד מחושבים במסד הנתונים, ה-AI מסביר אותם בלבד.");
  }catch(error){
   status("הניתוח לא הושלם: "+String(error?.message||error).slice(0,230)+" הנתונים לא שונו.");
  }finally{setBusy(false)}
 }
 function open(type){
  document.querySelector('button[data-screen="ai"]')?.click();
  if(type)return ask(type);
 }
 $("ai-test-connection").addEventListener("click",async()=>{
  const btn=$("ai-test-connection");
  if(btn.disabled)return;
  btn.disabled=true;
  status("בודק חיבור Supabase ו-Cloudflare בלי לשלוח נתונים פיננסיים.");
  try{
   const ok=await refreshStatus();
   status(ok?"פרטי החיבור נקלטו. פירוט הבדיקה מופיע באזור החיבור.":
    "הבדיקה הסתיימה. פירוט התקלה מופיע באזור החיבור.");
  }finally{btn.disabled=false}
 });
 $("ai-dashboard-open").addEventListener("click",()=>open("summary"));
 $("ai-history-open").addEventListener("click",()=>open("saving"));
 document.querySelectorAll("[data-ai-task]").forEach(btn=>btn.addEventListener("click",()=>ask(btn.dataset.aiTask)));
 $("ai-question-form").addEventListener("submit",e=>{
  e.preventDefault();const question=$("ai-question").value.trim();
  if(question){ask("question",question);$("ai-question").value=""}
 });
 document.addEventListener("tevuna:screen-changed",event=>{
  if(event.detail?.screen==="ai")refreshStatus();
 });
 document.addEventListener("tevuna:loaded",event=>{
  if(!event.detail?.household)return;
  const visible=!$("ai").classList.contains("hidden");
  if(visible)refreshStatus();
  const card=$("ai-dashboard-open");
  if(card)card.disabled=false;
 });
}
