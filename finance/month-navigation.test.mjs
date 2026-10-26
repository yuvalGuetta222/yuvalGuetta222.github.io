import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {shiftReportMonth,formatReportMonth} from "./month-navigation.mjs";

const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("./style.css",import.meta.url),"utf8");

test("Month navigation moves backward and forward across year boundaries",()=>{
 assert.equal(shiftReportMonth("2026-10",-1),"2026-09");
 assert.equal(shiftReportMonth("2026-10",1),"2026-11");
 assert.equal(shiftReportMonth("2026-01",-1),"2025-12");
 assert.equal(shiftReportMonth("2026-12",1),"2027-01");
 assert.equal(shiftReportMonth("2026-04",0),"2026-04");
});
test("Month navigation does not allow broken or out-of-range months",()=>{
 for(const value of ["", "2026-00","2026-13","2026-1","1999-12","2100-01","invalid"]){
  assert.equal(shiftReportMonth(value,1),null);
 }
 assert.equal(shiftReportMonth("2000-01",-1),null);
 assert.equal(shiftReportMonth("2099-12",1),null);
 assert.equal(shiftReportMonth("2026-06",1.5),null);
 assert.equal(shiftReportMonth("2026-06",Infinity),null);
});
test("Selected month is displayed with its Hebrew name, not an ambiguous numeric field",()=>{
 assert.match(formatReportMonth("2026-10"),/אוקטובר/);
 assert.match(formatReportMonth("2026-10"),/2026/);
 assert.match(formatReportMonth("2027-01"),/ינואר/);
 assert.equal(formatReportMonth("bad"),"בחרו חודש");
});
test("Month arrows preserve the original month input and trigger the existing change workflow",()=>{
 assert.equal((html.match(/id="month"/g)||[]).length,1);
 for(const id of ["month-prev","month-next","month-readable"]){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(html,/type="month" id="month"/);
 assert.match(html,/aria-label="חודש קודם"/);
 assert.match(html,/aria-label="חודש הבא"/);
 assert.match(app,/"month-prev"\)\.addEventListener\("click",\(\)=>navigateReportMonth\(-1\)\)/);
 assert.match(app,/"month-next"\)\.addEventListener\("click",\(\)=>navigateReportMonth\(1\)\)/);
 assert.match(app,/\$\("month"\)\.dispatchEvent\(new Event\("change",\{bubbles:true\}\)\)/);
 assert.match(app,/\$\("month"\)\.addEventListener\("change",\(\)=>\{\s*syncMonthNavigator\(\);/);
 assert.match(app,/function defaultDates\(\)\{\$\("month"\)\.value=currentMonth\(\);syncMonthNavigator\(\)/);
 assert.match(css,/\.month-switcher-arrow:focus-visible/);
 assert.match(css,/\.month-switcher-display input\[type="month"\]/);
});
