import {buildAlerts,decisionHighlights,forecastPanel,goalProgress,scenarioImpact,
  recurringPayments,addMonth,formatILS} from "./decision-center.mjs";
import {householdBalance} from "./household-ledger.mjs";
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{
 const el=document.createElement(tag);
 if(text!==undefined&&text!==null)el.textContent=String(text);
 if(cls)el.className=cls;
 return el;
};
const money=amount=>formatILS(amount);
function toAgorot(value,allowZero=false){
 const s=String(value??"").trim();
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(s))throw Error("יש להזין סכום בשקלים, עם עד שתי ספרות לאחר הנקודה.");
 const [a,b=""]=s.split(".");
 const cents=Number(a)*100+Number(b.padEnd(2,"0"));
 if(!Number.isSafeInteger(cents)||(!allowZero&&cents<=0)||cents>100000000000)throw Error("סכום אינו תקין.");
 return cents;
}
const copy={warning:"חשוב לבדוק",info:"לתשומת לב"};
const live=()=>!$("planning").classList.contains("hidden");
export function setupDecisionCenter({supabase,getContext}){
 let state=null,history=[],goals=[],sequence=0,hadHistoryError=false,hadGoalsError=false;
 const meta=$("planning-status");
 const findGoal=id=>goals.find(g=>g.id===id);
 function setStatus(text){meta.textContent=text||""}
 function open(screen){
  const button=document.querySelector('button[data-screen="'+screen+'"]');
  button?.click();
 }
 function alertCard(entry,extra=false){
  const row=make("article",null,"decision-alert "+entry.level);
  const main=make("div");
  main.append(make("strong",entry.title),make("p",entry.detail,"note"));
  const control=make("button",extra?"פתח לבדיקה":"עבור לבדיקה","secondary");
  control.type="button";
  control.addEventListener("click",()=>open(entry.target||"planning"));
  row.append(main,control);
  return row;
 }
 function renderHome(){
  const target=$("decision-home-notes");
  if(!target)return;
  target.replaceChildren();
  if(!state){target.append(make("p","התובנות יופיעו לאחר טעינת הנתונים.","empty"));return}
  const {notes,audit}=decisionHighlights({month:state.month,data:state.data,history,basis:state.basis});
  if(hadHistoryError)notes.push({title:"לא ניתן לטעון היסטוריית עסקאות",
   detail:"המלצות על חיובים חוזרים אינן זמינות עד שההיסטוריה תיטען.",level:"info",target:"planning"});
  if(audit.status!=="verified_from_file"&&state.basis==="statement")
   $("decision-home-label").textContent="מצב הנתונים דורש בדיקה";
  else $("decision-home-label").textContent="התובנות החשובות לחודש";
  for(const note of notes.slice(0,3))target.append(alertCard(note,true));
 }
 function renderAlerts(){
  const target=$("decision-alerts");target.replaceChildren();
  if(!state)return;
  const r=buildAlerts({month:state.month,data:state.data,history,basis:state.basis});
  if(!r.alerts.length)target.append(make("p","אין התראות מזוהות על סמך הנתונים שנקלטו. המערכת אינה מאמתת ישירות מול הבנק.","empty"));
  for(const entry of r.alerts)target.append(alertCard(entry));
  if(hadHistoryError)target.append(make("p","היסטוריית עסקאות לא נטענה, ולכן התראות על עליות במחירי מנויים עשויות להיות חסרות.","note"));
  $("decision-alert-count").textContent=r.alerts.length+" התראות באתר";
 }
 function renderRecurring(){
  const target=$("decision-recurring");target.replaceChildren();
  if(!state)return;
  const signals=recurringPayments(history,state.month);
  if(!signals.length)target.append(make("p",hadHistoryError?
    "לא הצלחנו לטעון את היסטוריית העסקאות. נסו לרענן את האתר.":
    "לא נמצאו עדיין שלושה חודשים רצופים עם חיוב דומה יחיד לאותו בית עסק. לא נוכל לזהות מנוי על סמך חודש אחד.","empty"));
  for(const item of signals){
   const row=make("article",null,"decision-recurring-row");
   const title=make("div");
   title.append(make("strong",item.merchant),
    make("small","חיוב דומה ב-"+item.months.length+" חודשים: "+item.months.join(" • ")+" • דורש אימות"));
   const amount=make("div",null,"decision-recurring-value");
   amount.append(make("b",money(item.amountAgorot)),
    make("small",item.increaseAgorot>0?"עלייה אפשרית של "+money(item.increaseAgorot):
      "חשד לחיוב חוזר, לא בהכרח מנוי"));
   row.append(title,amount);target.append(row);
  }
 }
 function renderForecast(){
  const target=$("decision-forecast");target.replaceChildren();
  if(!state)return;
  const result=forecastPanel({month:state.month,basis:state.basis,data:state.data,history,now:new Date()});
  const ledger=result.ledger;
  target.append(make("div","הוצאות מעסקאות שנקלטו: "+money(ledger.recordedSpending),"decision-metric"));
  target.append(make("div","התחייבויות נוספות שלא קושרו לעסקאות: "+money(ledger.unmatched),"decision-metric"));
  if(result.forecast&&result.forecast.projectedTotal!==null){
   target.append(make("strong","אומדן הוצאות לסוף החודש: "+money(result.forecast.projectedTotal)));
   if(result.forecast.lower!==null)target.append(make("p","טווח המחשה: "+
    money(result.forecast.lower)+" עד "+money(result.forecast.upper),"note"));
   target.append(make("p","רמת ביטחון: "+result.confidence+". "+(result.reason||""),"note"));
  }else target.append(make("p","אין תחזית מספרית אמינה: "+(result.reason||"לא קיימים מספיק נתונים"),"note"));
  target.append(make("p","זו הערכה להוצאות ולא יתרת בנק. חיובים עתידיים אינם ודאיים. התחייבויות שכבר נכללו בעסקאות לא ייספרו פעמיים.","note"));
 }
 function renderGoals(){
  const holder=$("decision-goals");holder.replaceChildren();
  if(!state)return;
  if(hadGoalsError)holder.append(make("p","לא ניתן לקרוא את יעדי החיסכון מהענן. הנתונים הקיימים לא שונו.","decision-error"));
  if(!goals.length)holder.append(make("p","אין עדיין יעד חיסכון. צרו יעד ראשון ועקבו אחר ההתקדמות ידנית.","empty"));
  for(const goal of goals){
   const today=new Date();
   const nowMonth=String(today.getFullYear())+"-"+String(today.getMonth()+1).padStart(2,"0");
   const result=goalProgress(goal,nowMonth);
   const card=make("article",null,"decision-goal");
   const header=make("div",null,"decision-goal-head");
   header.append(make("strong",goal.title),
     make("b",money(result.saved)+" / "+money(result.target)));
   card.append(header);
   const progress=make("progress");progress.max=100;progress.value=result.percent;
   progress.setAttribute("aria-label","התקדמות יעד "+goal.title+": "+result.percent+" אחוזים");
   card.append(progress);
   const note=goal.target_month?
     result.overdue?"תאריך היעד חלף. עדיין נותרו "+money(result.remaining)+" לחיסכון.":
     result.remaining===0?"היעד הושג לפי הסכומים שסומנו.":
     "נשארו "+money(result.remaining)+". כדי להגיע ליעד עד "+goal.target_month.slice(0,7)+
     " צריך לשמור כ-"+money(result.monthlyRequired)+" בחודש (המחשה בלבד).":
     "נשארו "+money(result.remaining)+". לא הוגדר תאריך יעד.";
   card.append(make("p",note,"note"));
   const controls=make("div",null,"decision-goal-actions");
   const label=make("label","עדכן סכום שנצבר (₪)");
   const input=make("input");input.type="number";input.step="0.01";input.min="0";input.max="1000000000";
   input.value=(goal.saved_agorot/100).toFixed(2);input.setAttribute("aria-label","סכום שנצבר עבור "+goal.title);
   label.append(input);
   const save=make("button","שמירה","secondary");save.type="button";
   save.addEventListener("click",async()=>{
    if(!getContext()?.user)return;
    try{
     const amount=toAgorot(input.value,true);
     save.disabled=true;setStatus("מעדכן יעד חיסכון...");
     const {data:updated,error}=await supabase.from("tevuna_savings_goals")
       .update({saved_agorot:amount})
       .eq("household_id",getContext().household).eq("id",goal.id).select("id");
     if(error||!updated?.length)throw Error(error?.message||"לא אושר עדכון היעד");
     await fetchGoals();setStatus("היעד עודכן. רישום זה אינו מעביר כסף בפועל.");
    }catch(err){setStatus("לא ניתן לעדכן יעד: "+String(err.message||err).slice(0,140))}
    finally{save.disabled=false}
   });
   const remove=make("button","מחיקת יעד","danger");remove.type="button";
   remove.addEventListener("click",async()=>{
    if(!confirm("למחוק את יעד החיסכון '"+goal.title+"'? לא יימחקו עסקאות או סכומים בחשבון."))return;
    remove.disabled=true;
    const {data:deleted,error}=await supabase.from("tevuna_savings_goals")
      .delete().eq("household_id",getContext().household).eq("id",goal.id).select("id");
    if(error||!deleted?.length){setStatus("לא ניתן למחוק יעד.");remove.disabled=false;return}
    await fetchGoals();setStatus("היעד נמחק. לא בוצעה תנועה כספית.");
   });
   controls.append(label,save,remove);card.append(controls);holder.append(card);
  }
 }
 function render(){
  renderHome();renderAlerts();renderRecurring();renderForecast();renderGoals();
 }
 async function fetchGoals(){
  const ctx=getContext();
  if(!ctx?.household)return;
  const owner=ctx.household;
  const {data,error}=await supabase.from("tevuna_savings_goals")
   .select("id,title,target_agorot,saved_agorot,target_month,created_at")
   .eq("household_id",owner).order("created_at",{ascending:false}).limit(40);
  if(getContext().household!==owner)return;
  hadGoalsError=!!error;
  if(!error)goals=data||[];
  renderGoals();
 }
 async function loadHistory(month,owner){
  const from=addMonth(month,-4)+"-01",to=addMonth(month,1)+"-01",all=[];
  for(let off=0;off<4000;off+=1000){
   const {data,error}=await supabase.from("tevuna_transactions")
     .select("id,occurred_on,merchant,category,amount_agorot,entry_kind,installment_total")
     .eq("household_id",owner).gte("occurred_on",from).lt("occurred_on",to)
     .order("occurred_on",{ascending:true}).order("id",{ascending:true})
     .range(off,off+999);
   if(error)throw error;
   all.push(...(data||[]));
   if((data||[]).length<1000)return all;
  }
  throw Error("היסטוריית העסקאות גדולה מדי לטעינה בטוחה.");
 }
 document.addEventListener("tevuna:auth-cleared",()=>{
  sequence++;state=null;history=[];goals=[];hadHistoryError=false;hadGoalsError=false;
  $("decision-home-notes").replaceChildren(make("p","יש להתחבר כדי לראות תובנות.","empty"));
  $("decision-alerts").replaceChildren();
  $("decision-recurring").replaceChildren();
  $("decision-forecast").replaceChildren();
  $("decision-goals").replaceChildren();
  setStatus("");
 });
 document.addEventListener("tevuna:loaded",async event=>{
  const {data,month,household}=event.detail||{};
  if(!data||!household)return;
  const seq=++sequence,basis=$("date-basis").value;
  state={month,data,basis};history=[];hadHistoryError=false;
  render();
  await Promise.all([
   loadHistory(month,household).then(rows=>{
    if(seq!==sequence||getContext().household!==household)return;
    history=rows;hadHistoryError=false;render();
   }).catch(()=>{
    if(seq!==sequence)return;
    hadHistoryError=true;render();
   }),
   fetchGoals()
  ]);
  if(seq===sequence)setStatus(hadHistoryError?
   "נתוני החודש נטענו, אך חלק מההיסטוריה לא זמין. ההמלצות החוזרות מוגבלות.":
   "הנתונים מחושבים מהחשבון שלכם בלבד. התראות מופיעות באתר כשפותחים אותו, לא כהודעות Push.");
 });
 $("decision-goal-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const ctx=getContext();if(!ctx?.user||!ctx.household)return;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  try{
   const title=String(form.elements.title.value).trim();
   if(title.length<2||title.length>80)throw Error("שם היעד צריך לכלול 2 עד 80 תווים.");
   const target=toAgorot(form.elements.target.value);
   const saved=toAgorot(form.elements.saved.value||"0",true);
   const due=String(form.elements.due.value||"");
   if(due&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(due))throw Error("חודש יעד לא תקין.");
   button.disabled=true;
   const {error}=await supabase.from("tevuna_savings_goals").insert({
    household_id:ctx.household,created_by:ctx.user.id,title,
    target_agorot:target,saved_agorot:saved,target_month:due?due+"-01":null
   });
   if(error)throw error;
   form.reset();await fetchGoals();setStatus("היעד נשמר למשק הבית. הסכום שנצבר הוא רישום ידני, לא העברה לחשבון חיסכון.");
  }catch(err){setStatus("לא ניתן לשמור יעד: "+String(err?.message||err).slice(0,160))}
  finally{button.disabled=false}
 });
 function simulate(){
  const display=$("decision-scenario-result");
  if(!state){display.textContent="יש לטעון נתוני חודש קודם.";return}
  try{
   const amount=toAgorot($("decision-scenario-amount").value||"0",true);
   const kind=$("decision-scenario-kind").value;
   const ledger=householdBalance({incomes:state.data.income,transactions:state.data.transactions,
    fixed:state.data.fixed,coverage:state.data.coverage,month:state.month});
   const r=scenarioImpact({ledger,monthlyAgorot:amount,kind});
   display.textContent="השפעה היפותטית לחודש: "+(r.monthlyChangeAgorot>=0?"+":"")+
    money(r.monthlyChangeAgorot)+". לשנה שלמה: "+
    (r.annualChangeAgorot>=0?"+":"")+money(r.annualChangeAgorot)+
    ". יתרה לתכנון בתרחיש: "+money(r.estimatedPlanningBalanceAgorot)+
    ". זה אינו חיסכון בפועל או יתרת בנק, ואינו משנה נתונים.";
  }catch(err){display.textContent=String(err?.message||err)}
 }
 $("decision-scenario-kind").addEventListener("change",simulate);
 $("decision-scenario-amount").addEventListener("input",simulate);
 document.addEventListener("tevuna:screen-changed",e=>{
  if(e.detail?.screen==="planning"){simulate();render();}
 });
 $("decision-home-all").addEventListener("click",()=>open("planning"));
 document.addEventListener("tevuna:loaded",simulate);
}
