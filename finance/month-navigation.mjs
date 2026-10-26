// Stable, pure month navigation for the selected financial reporting period.
// UTC arithmetic avoids DST and end-of-month rollover across time zones.
const valid = value => /^20\d{2}-(0[1-9]|1[0-2])$/.test(String(value));
export function shiftReportMonth(month,delta){
 if(!valid(month)||!Number.isInteger(delta)||Math.abs(delta)>1200)return null;
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 const index=year*12+(m-1)+delta;
 const nextYear=Math.floor(index/12);
 if(nextYear<2000||nextYear>2099)return null;
 return String(nextYear)+"-"+String(index%12+1).padStart(2,"0");
}
export function formatReportMonth(month){
 if(!valid(month))return "בחרו חודש";
 const date=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1));
 return new Intl.DateTimeFormat("he-IL",{month:"long",year:"numeric",timeZone:"UTC"}).format(date);
}
