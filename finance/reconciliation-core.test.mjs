import test from "node:test";
import assert from "node:assert/strict";
import {reconcileSources} from "./reconciliation-core.mjs";
test("Overlapping partial and complete October MAX reports are NOT added together",()=>{
 const cases=[
  {filename:"אוקטובר_2026_אשראי_מאוחד_חדש.xlsx",transaction_count:31,net_amount_agorot:959938,expected_count:31,expected_net_agorot:959938,source_header_total_agorot:2598674},
  {filename:"אוקטובר_2026_אשראי_מאוחד.xlsx",transaction_count:77,net_amount_agorot:2206219,expected_count:77,expected_net_agorot:2206219,source_header_total_agorot:2206219},
  {filename:"אוקטובר_2026_ויזה_7888_אשראי_מאוחד.xlsx",transaction_count:21,net_amount_agorot:627678,expected_count:21,expected_net_agorot:627678,source_header_total_agorot:627678}
 ];
 const data=reconcileSources(cases);
 assert.equal(data.length,2);
 const max=data.find(x=>x.issuer==="max");
 assert.equal(max.bestDetailedAgorot,2206219);
 assert.equal(max.gapAgorot,392455);
 assert.equal(max.status,"source_disputed");
 assert.equal(max.differentHeaderClaims,true);
 assert.equal(data.find(x=>x.issuer==="visa7888").status,"source_matched");
});
test("September difference is a warning, not an automatically created expense",()=>{
 const data=reconcileSources([{filename:"ספטמבר_2026_אשראי_מאוחד_חדש.xlsx",transaction_count:60,
 net_amount_agorot:756002,expected_count:60,expected_net_agorot:756002,source_header_total_agorot:1100679}]);
 assert.equal(data[0].gapAgorot,344677);
 assert.equal(data[0].bestDetailedAgorot,756002);
});
test("Unknown source header is not shown as confirmed",()=>{
 const data=reconcileSources([{filename:"other.xlsx",transaction_count:10,net_amount_agorot:10000,
 expected_count:null,expected_net_agorot:null,source_header_total_agorot:null}]);
 assert.equal(data[0].status,"unverified");
});
