// The user's provider token lives only in JS memory, never localStorage,
// cookies, telemetry, query parameters, or database tables.
let temporaryKey="";
let authenticated=false;
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
 return "הקריאה לשירות ה-AI נכשלה. בדקו את החיבור והמפתח.";
}
export function setupAICoach(runtime){
 const context=runtime;
 async function refreshStatus(){
  const {user,household}=runtime.getContext();
  if(!user||!household){authenticated=false;return}
  authenticated=true;
  const {data,error}=await runtime.supabase.functions.invoke("tevuna-ai-coach",{body:{type:"status"}});
  if(error){
   $("ai-connection-status").textContent="שירות AI אינו זמין. השאלות לא יישלחו עד שהחיבור יאומת.";
   return;
  }
  if(data?.ready){
   $("ai-connection-status").textContent="✓ ה-AI מחובר דרך שרת תבונה. לא צריך מפתח זמני.";
   $("ai-key-setup").hidden=true;
  }else{
   $("ai-key-setup").hidden=false;
   $("ai-connection-status").textContent=temporaryKey?
    "מפתח זמני נטען לזיכרון הדף. ניתוח AI יתבצע רק בלחיצה על כפתור.":
    "המודל מותקן, אך לא הוגדר מפתח API בשרת. הזינו מפתח זמני כדי להפעיל תשובות AI אמיתיות.";
  }
 }
 async function ask(type,question=""){
  if(inFlight)return;
  const {user,household}=context.getContext();
  if(!authenticated||!user||!household){status("יש להתחבר לחשבון המשפחתי.");return}
  const month=$("month").value,basis=$("date-basis").value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){status("בחרו חודש תקין.");return}
  if(type==="question"&&(!question.trim()||question.length>400)){status("כתבו שאלה עד 400 תווים.");return}
  if(type==="question")message("user",question);
  else message("user",type==="summary"?"סכם את המצב הפיננסי בחודש הנבחר":"איפה אפשר לחסוך החודש?");
  setBusy(true);status("מנתח נתוני תקציב מסוכמים... לא שולח את דוחות האשראי הגולמיים.");
  try{
   const opts={body:{type,question,month,basis,household}};
   if(temporaryKey)opts.headers={"x-tevuna-ai-key":temporaryKey};
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
   status(String(error?.message||error).slice(0,230));
   message("ai","לא התקבלה תשובת AI. לא בוצע שינוי בנתונים. "+String(error?.message||"").slice(0,180));
  }finally{setBusy(false)}
 }
 function open(type){
  document.querySelector('button[data-screen="ai"]')?.click();
  if(type)ask(type);
 }
 $("ai-dashboard-open").addEventListener("click",()=>open("summary"));
 $("ai-history-open").addEventListener("click",()=>open("saving"));
 document.querySelectorAll("[data-ai-task]").forEach(btn=>btn.addEventListener("click",()=>ask(btn.dataset.aiTask)));
 $("ai-question-form").addEventListener("submit",e=>{
  e.preventDefault();const question=$("ai-question").value.trim();
  if(question){ask("question",question);$("ai-question").value=""}
 });
 $("ai-use-key").addEventListener("click",()=>{
  const candidate=$("ai-key-input").value.trim();
  if(!/^sk-[A-Za-z0-9_-]{15,}$/.test(candidate)){status("פורמט מפתח OpenAI אינו תקין.");return}
  temporaryKey=candidate;
  $("ai-key-input").value="";
  $("ai-connection-status").textContent="✓ מפתח זמני נטען רק לזיכרון הדף; הוא ייעלם ברענון או בסגירת האתר.";
  status("אפשר לשאול שאלה או לבקש סיכום.");
 });
 $("ai-clear-key").addEventListener("click",()=>{
  temporaryKey="";$("ai-key-input").value="";
  $("ai-connection-status").textContent="מפתח זמני נוקה. לא נשמר שום מפתח באתר.";
  status("");
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
