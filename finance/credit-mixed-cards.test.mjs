import test from "node:test";
import assert from "node:assert/strict";
import {guessMapping,convertRows} from "./credit-core.mjs";
import {sheetCardSummary,cardLast4,cardFingerprintInput} from "./card-import.mjs";

const headings=["תאריך עסקה","שם בית העסק","קטגוריה","4 ספרות אחרונות של כרטיס האשראי",
  "סוג עסקה","סכום חיוב","מטבע חיוב","סכום עסקה מקורי","מטבע עסקה מקורי","תאריך חיוב"];
const sample=[
 headings,
 ["13-10-2026","קינן שפי","עירייה וממשלה","9591","רגילה",300,"₪",300,"₪","15-10-2026"],
 ["12-10-2026","קלמנטינה פירות וירקות","מזון וצריכה","0628","רגילה",12.9,"₪",12.9,"₪","15-10-2026"],
 ["12-10-2026","חנות חשמל","חשבונות הבית","6529","רגילה",200,"₪",200,"₪","15-10-2026"],
 ["13-10-2026","חנות אלקטרוניקה","קניות","1041","רגילה",100,"₪",100,"₪","15-10-2026"],
 ["15-10-2026","תשלום נוסף","שונות","7888","רגילה",15,"₪",15,"₪","15-10-2026"]
];
test("MAX combined credit sheet uses card column instead of forcing a single-card import",()=>{
 const mapping=guessMapping(headings);
 assert.equal(mapping.card,3);
 assert.equal(mapping.amount,5);
 assert.equal(mapping.date,0);
 const parsed=convertRows(sample,0,mapping);
 assert.equal(parsed.valid.length,5);
 assert.deepEqual(new Set(parsed.valid.map(x=>x.rowCardLast4)),new Set(["9591","0628","6529","1041","7888"]));
 const summary=sheetCardSummary(parsed.valid);
 assert.equal(summary.cards.length,5);assert.equal(summary.unknownCount,0);assert.equal(summary.allIdentified,true);
 assert.equal(parsed.valid[1].amount_agorot,1290);
 assert.equal(parsed.valid[1].rowCardLast4,"0628");
});
test("Different cards receive separate fingerprint input even for identical charges and dates",()=>{
 const rows=[
 headings,
 ["13-10-2026","אותה חנות","קניות","9591","רגילה",100],
 ["13-10-2026","אותה חנות","קניות","0628","רגילה",100],
 ["13-10-2026","אותה חנות","קניות","9591","רגילה",100]
 ];
 const results=convertRows(rows,0,guessMapping(headings)).valid;
 const idA="00000000-0000-4000-8000-000000000001",idB="00000000-0000-4000-8000-000000000002";
 assert.equal(results[0].importSequence,1);
 assert.equal(results[1].importSequence,1);
 assert.equal(results[2].importSequence,2);
 assert.notEqual(cardFingerprintInput(idA,results[0]),cardFingerprintInput(idB,results[1]));
 assert.notEqual(cardFingerprintInput(idA,results[0]),cardFingerprintInput(idA,results[2]));
});
test("Missing card in partially identified combined sheet remains unresolved, never guessed",()=>{
 const rows=[...sample,["12-10-2026","לא ידוע","קניות","", "רגילה",50]];
 const results=convertRows(rows,0,guessMapping(headings)).valid;
 const summary=sheetCardSummary(results);
 assert.equal(summary.unknownCount,1);assert.equal(summary.allIdentified,false);
 assert.deepEqual(summary.unknownLines,[7]);
 assert.equal(cardLast4(628),"0628");
});
