/* Tevuna credit statement parsing — local-only, no raw files uploaded. */
export const CATEGORIES = ["מזון וסופר","מסעדות ומשלוחים","תחבורה","בילויים","בריאות","קניות","חשבונות הבית","שכירות","מנויים","חינוך","ביטוח","נסיעות ונופש","אחר"];

const headers = {
  date: ["תאריך חיוב","תאריך זיכוי","תאריך עסקה","תאריך ביצוע","תאריך רכישה","תאריך","date","transaction date","posting date"],
  merchant: ["שם בית עסק","שם העסק","בית עסק","שם בית העסק","שם ספק","שם בית עסק / תיאור","תיאור עסקה","תיאור פעולה","תיאור","merchant","description","supplier"],
  amount: ["סכום חיוב בשח","סכום חיוב בשקל","סכום לחיוב","סכום החיוב","סכום חיוב","סכום בשח","סכום בשקל","סכום ₪","סכום העסקה בשח","סכום העסקה","סכום עסקה","סכום","amount","charged amount","billing amount"],
  kind: ["סוג חיוב","חיוב / זיכוי","חיוב/זיכוי","סוג עסקה","סוג פעולה","חיוב או זיכוי","type","debit credit"],
  reference: ["מספר אסמכתא","מספר שובר","אסמכתא","מספר עסקה","מזהה עסקה","reference","transaction id"],
  card: ["4 ספרות אחרונות","ארבע ספרות אחרונות","מספר כרטיס","כרטיס אשראי","כרטיס","card number","card"]
};
const key = v => String(v??"").normalize("NFKC").toLowerCase()
 .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069"“”'’.,:;()\-\/\\_\u20aa]/g," ")
 .replace(/\s+/g," ").trim();
export function guessMapping(row) {
  const vals = row.map(key);
  const map = {};
  for(const [field,words] of Object.entries(headers)) {
    let best = -1, max = 0;
    for (let i=0; i<vals.length; i++) for(let j=0;j<words.length;j++) {
      const k=key(words[j]);
      const score = vals[i]===k ? (400-j*3) : vals[i].startsWith(k+" ") ? (200-j*2) : (k.length>5&&vals[i].includes(k)) ? (100-j) : 0;
      if(score>max){max=score;best=i}
    }
    map[field]=best;
  }
  return map;
}
export function findHeaderRow(rows) {
  let best={index:-1,score:0,mapping:null};
  for(let i=0;i<Math.min(rows.length,35);i++){
    const mapping=guessMapping(rows[i]||[]);
    const score=(mapping.date>=0?4:0)+(mapping.merchant>=0?4:0)+(mapping.amount>=0?4:0)+(mapping.kind>=0?1:0)+(mapping.reference>=0?1:0);
    if(score>best.score)best={index:i,score,mapping};
  }
  return best.score>=12?best:null;
}
function countOutsideQuotes(line,delimiter){
  let inside=false,total=0;
  for(let i=0;i<line.length;i++){if(line[i]==='"'){if(line[i+1]==='"'){i++;continue}inside=!inside}else if(!inside&&line[i]===delimiter)total++}
  return total;
}
export function detectDelimiter(text) {
  const first=text.replace(/^\uFEFF/,"").split(/\r?\n/).slice(0,20).filter(x=>x.trim()).slice(0,8);
  if (/^sep=([;,\t])\r?$/i.test(first[0]||"")) return RegExp.$1;
  const scored=[",",";","\t"].map(d=>[d,first.slice(0,6).map(line=>countOutsideQuotes(line,d)).filter(n=>n>0)]);
  scored.sort((a,b)=>(b[1].length>=3?b[1].length:0)-(a[1].length>=3?a[1].length:0) || b[1].reduce((x,y)=>x+y,0)-a[1].reduce((x,y)=>x+y,0));
  return scored[0][0];
}
export function parseCSV(text) {
  const s=String(text).replace(/^\uFEFF/,"");
  const delimiter=detectDelimiter(s);
  const rows=[]; let row=[],cell="",quoted=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='"'){
      if(quoted&&s[i+1]==='"'){cell+='"';i++}
      else quoted=!quoted;
    } else if(c===delimiter&&!quoted){row.push(cell.trim());cell=""}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&s[i+1]==='\n')i++;
      row.push(cell.trim());cell="";
      if(row.some(x=>x!=="")&&!/^sep=([;,\t])$/i.test(row[0]||""))rows.push(row);
      row=[];
    } else cell+=c;
  }
  row.push(cell.trim());if(row.some(x=>x!=="")&&!/^sep=([;,\t])$/i.test(row[0]||""))rows.push(row);
  if(quoted)throw Error("קובץ ה-CSV אינו תקין: סימני מירכאות לא מאוזנים.");
  return rows;
}
export function parseDate(value) {
  if(value instanceof Date&&!Number.isNaN(value.valueOf()))return [value.getFullYear(),String(value.getMonth()+1).padStart(2,"0"),String(value.getDate()).padStart(2,"0")].join("-");
  if(typeof value==="number" && value>30000&&value<90000){const d=new Date(Date.UTC(1899,11,30)+Math.trunc(value)*86400000);return d.toISOString().slice(0,10)}
  const s=String(value??"").trim();
  let y,m,d;
  let found=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if(found){y=Number(found[1]);m=Number(found[2]);d=Number(found[3])}
  else{found=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);if(!found)return null;
    d=Number(found[1]);m=Number(found[2]);y=Number(found[3]);if(y<100)y+=y>=70?1900:2000;
  }
  if(y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
  return [y,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
export function parseAmount(value) {
  if(typeof value==="number")return Number.isFinite(value)?Math.round(value*100):null;
  let s=String(value??"").replace(/[\u200e\u200f\s₪$€]/g,"").trim();
  if(!s||s==="-"||s==="—")return null;
  const neg=/^\(.*\)$/.test(s)||s.includes("-");
  s=s.replace(/[()\-+]/g,"");
  if(!/^[0-9.,]+$/.test(s))return null;
  const lastDot=s.lastIndexOf("."),lastComma=s.lastIndexOf(","),idx=Math.max(lastDot,lastComma);
  if(idx>=0) {
    const digits=s.length-idx-1;
    if(digits===1||digits===2)s=s.slice(0,idx).replace(/[.,]/g,"")+"."+s.slice(idx+1);
    else s=s.replace(/[.,]/g,"");
  }
  const n=Number(s);
  if(!Number.isFinite(n)||n>100000000||n<0)return null;
  return Math.round(n*100)*(neg?-1:1);
}
export function categorize(merchant, description="") {
  const s=key(merchant+" "+description);
  const matches=[
   ["מזון וסופר",/(שופרסל|רמי לוי|ויקטורי|יוחננוף|קרפור|יינות ביתן|חצי חינם|אושר עד|מחסני השוק|סופר פארם מרקט|סופרמרקט|מכולת|סופר\b|supermarket|grocery|חנות נוחות|פרשמרקט)/],
   ["מסעדות ומשלוחים",/(וולט|wolt|תן ביס|תנביס|10bis|מסעד|קפה |coffee|aroma|ארומה|מקדונלד|mcdonald|דומינוס|פיצה|pizza|בורגר|סושי|מסעדה|delivery hero|ברגר קינג|קונדיטוריה|מאפיה)/],
   ["תחבורה",/(דלק|פז\b|סונול|דור אלון|ten station|תחנת דלק|כביש 6|פנגו|pango|סלופארק|cellopark|מוביט|moovit|רב קו|רכבת|אגד|דן תחבורה|אובר|uber|yango|יאנגו|חניה|parking|taxi)/],
   ["מנויים",/(נטפליקס|netflix|spotify|ספוטיפיי|apple.com.bill|apple services|youtube premium|disney|דיסני|amazon prime|פריים וידאו|chatgpt|openai|icloud|dropbox|notion|adobe|microsoft 365)/],
   ["חשבונות הבית",/(חברת חשמל|electric company|בזק|bezeq|הוט|hot mobile|פרטנר|partner|סלקום|cellcom|מי אביבים|תאגיד המים|ארנונה|עיריית|מועצה מקומית|גז טבעי|בזק בינלאומי)/],
   ["ביטוח",/(הראל|מגדל ביטוח|כלל ביטוח|מנורה מבטחים|איילון ביטוח|ביטוח ישיר|ליברה ביטוח|הפניקס ביטוח|we sure)/],
   ["בריאות",/(סופר פארם|super.pharm|be פארם|קופת חולים|מכבי שירותי|כללית|מאוחדת|בית מרקחת|רופא|dentist|מרפאה)/],
   ["נסיעות ונופש",/(booking|airbnb|expedia|agoda|ryanair|wizz air|easyjet|אל על|el al|ישראייר|ארקיע|מלון|hotel|airlines|טיסה|רכבת יפן)/],
   ["בילויים",/(סינמה|cinema|יס פלאנט|yes planet|לונה פארק|כרטיסים|תיאטרון|היכל התרבות|הופעה|ticketmaster)/],
   ["קניות",/(אמזון|amazon|aliexpress|shein|שיין|zara|זארה|h&m|asos|next|איקאה|ikea|fox|קסטרו|אדידס|nike|דלתא|terminal x|טרמינל איקס)/]
  ];
  return matches.find(([,re])=>re.test(s))?.[0]||"אחר";
}
const isSummary=v=>/(?:^|\s)(סהכ|סך הכל|סה כ|total|יתרת פתיחה|יתרת סגירה|סיכום חיובים|סכום כולל|סכום לתשלום)(?:\s|$)/.test(key(v));
export function convertRows(rows, headerIndex, mapping) {
  const result=[], skipped=[];
  const counts=new Map();
  for(let i=headerIndex+1;i<rows.length;i++){
    const row=rows[i]||[];
    const cell=k=>mapping[k]>=0?row[mapping[k]]:null;
    const merchant=String(cell("merchant")??"").replace(/\s+/g," ").trim().slice(0,150);
    const date=parseDate(cell("date"));
    const parsed=parseAmount(cell("amount"));
    const kindText=key(cell("kind"));
    if(!merchant&&!date&&parsed===null)continue;
    if(isSummary(merchant)){skipped.push({line:i+1,reason:"שורת סיכום"});continue}
    if(!merchant||!date||parsed===null||parsed===0||Math.abs(parsed)>100000000000){
      skipped.push({line:i+1,reason:!date?"תאריך לא מזוהה":!merchant?"אין בית עסק":"סכום לא תקין"});continue;
    }
    const explicitRefund=/(זיכוי|החזר|refund|credit)/.test(kindText);
    const explicitCharge=/(חיוב|debit|charge)/.test(kindText);
    const entry_kind=explicitRefund?"refund":explicitCharge?"expense":parsed<0?"refund":"expense";
    const amount_agorot=Math.abs(parsed);
    const reference=key(cell("reference")||"");
    const card=key(cell("card")||"");
    const identity=[date,key(merchant),String(amount_agorot),entry_kind,reference,card].join("|");
    const seq=(counts.get(identity)||0)+1;counts.set(identity,seq);
    result.push({line:i+1,occurred_on:date,merchant,amount_agorot,entry_kind,category:categorize(merchant),identity,sequence:seq,selected:true});
  }
  return {valid:result,skipped};
}
export function fileIsSupported(filename){return /\.(csv|xlsx)$/i.test(filename)}
