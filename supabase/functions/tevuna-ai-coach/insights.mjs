// Only aggregated financial facts leave Supabase. Arithmetic is performed in integer cents.
// The model-facing result is denominated entirely in ILS (shekels).
const integer = x => {
  const value = Number(x);
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) return 0;
  return value;
};
export const ils = agorot => Math.round(integer(agorot)) / 100;
const signed = row => (row.entry_kind === "refund" ? -1 : 1) * integer(row.amount_agorot);
const pct = (part, whole) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null;
const total = rows => rows.reduce((sum, row) => sum + signed(row), 0);
function byCategory(rows) {
  const map = new Map();
  for (const row of rows) {
    const name = String(row.category || "אחר").trim().slice(0, 60) || "אחר";
    map.set(name, (map.get(name) || 0) + signed(row));
  }
  return map;
}
function quality(statements) {
  const mismatch = statements.filter(s => s.source_header_total_agorot !== null &&
    integer(s.source_header_total_agorot) !== integer(s.net_amount_agorot));
  return {
    statement_count: statements.length,
    mismatched_statement_count: mismatch.length,
    no_source_total_count: statements.filter(s => s.source_header_total_agorot === null).length,
    mismatch_total_absolute_ils: ils(mismatch.reduce((sum, s) =>
      sum + Math.abs(integer(s.source_header_total_agorot) - integer(s.net_amount_agorot)), 0))
  };
}
function localMonth(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  return year + "-" + month;
}
export function buildFinancialInsights({
  month, previousMonth, basis, current = [], previous = [],
  currentIncome = 0, previousIncome = 0, budgets = [],
  source = [], previousSource = [], now = new Date()
}) {
  const currentTotal = total(current), previousTotal = total(previous);
  const nowMonth = localMonth(now), currentPartial = month === nowMonth;
  const currentCats = byCategory(current), previousCats = byCategory(previous);
  const currentQuality = quality(source), previousQuality = quality(previousSource);
  const mismatch = currentQuality.mismatched_statement_count > 0 ||
    previousQuality.mismatched_statement_count > 0;
  const missingComparison = current.length === 0 || previous.length === 0;
  const comparisonStatus = mismatch ? "source_discrepancy" :
    missingComparison ? "insufficient_data" : currentPartial ? "current_month_partial" : "available";
  const comparisonReliable = comparisonStatus === "available";
  const groups = [...currentCats].sort((a,b) => b[1]-a[1]);
  const currentCategories = groups.slice(0, 12).map(([category, amount]) => ({
    category, spending_ils: ils(amount), share_percent: amount > 0 ? pct(amount, currentTotal) : null
  }));
  const previousCategories = [...previousCats].sort((a,b) => b[1]-a[1]).slice(0, 12)
    .map(([category, amount]) => ({category, spending_ils: ils(amount)}));
  const changes = [...new Set([...currentCats.keys(), ...previousCats.keys()])].map(category => {
    const amount = currentCats.get(category) || 0, prior = previousCats.get(category) || 0;
    return {category, current_ils: ils(amount), previous_ils: ils(prior),
      change_ils: ils(amount-prior), change_percent: prior > 0 ? pct(amount-prior, prior) : null};
  }).sort((a,b) => Math.abs(b.change_ils)-Math.abs(a.change_ils)).slice(0, 8);
  const budgetRows = budgets.filter(b => Number(b.amount_agorot) > 0).slice(0, 30)
    .map(b => {
      const allowed = integer(b.amount_agorot), spent = currentCats.get(String(b.category)) || 0;
      return {category: String(b.category).slice(0,60), limit_ils: ils(allowed),
        spent_ils: ils(spent), remaining_ils: ils(allowed-spent),
        utilization_percent: pct(spent, allowed),
        over_budget_ils: ils(Math.max(0,spent-allowed))};
    }).sort((a,b) => b.over_budget_ils-a.over_budget_ils);
  const focus = [
    ...budgetRows.filter(b => b.over_budget_ils > 0).slice(0, 3).map(b => ({
      kind: "over_budget", category: b.category, evidence: {
        over_budget_ils: b.over_budget_ils, utilization_percent: b.utilization_percent}
    })),
    ...(comparisonReliable ? changes.filter(c => c.change_ils > 0 && c.previous_ils > 0)
      .slice(0, 3).map(c => ({kind:"higher_than_previous_month",category:c.category,
        evidence:{change_ils:c.change_ils,change_percent:c.change_percent}})) : [])
  ].slice(0, 4);
  return {
    currency: "ILS", currency_symbol: "₪",
    selected_month: month, previous_month: previousMonth, date_basis: basis,
    current_month_is_incomplete: currentPartial,
    current: {
      transaction_count: current.length, recorded_card_and_manual_spending_ils: ils(currentTotal),
      received_income_ils: ils(currentIncome), largest_spending_categories: currentCategories
    },
    previous: {
      transaction_count: previous.length, recorded_card_and_manual_spending_ils: ils(previousTotal),
      received_income_ils: ils(previousIncome), largest_spending_categories: previousCategories
    },
    comparison: {
      status: comparisonStatus,
      reliable_full_month_comparison: comparisonReliable,
      spending_change_ils: comparisonReliable ? ils(currentTotal-previousTotal) : null,
      spending_change_percent: comparisonReliable ? pct(currentTotal-previousTotal, previousTotal) : null,
      category_changes_for_reference_only: comparisonReliable ? changes : []
    },
    budgets: budgetRows.slice(0, 15),
    evidence: {current:currentQuality, previous:previousQuality,
      note: "Missing source totals or imported statements may mean the data is not verified or complete."},
    grounded_focus_candidates: focus,
    limits: [
      "כל הסכומים המועברים למודל כבר נקובים בשקלים חדשים. אין להמיר או להכפיל ב-100.",
      "הוצאות מבוססות על חיובים רשומים לאחר קיזוז זיכויים; אין להסיק שחודש חסר נתונים הוא חודש ללא הוצאות.",
      "חודש נוכחי חלקי, לכן אין להסיק על שינוי אמיתי ביחס לחודש מלא קודם.",
      "הכנסה כוללת רק כסף שסומן כהתקבל.",
      "הוצאות קבועות נוספות והתחייבויות לא מקושרות אינן כלולות ואין להציג יתרת בנק או חיסכון ודאי.",
      "לא הועברו שמות בתי עסק, מספרי חשבונות, מספרי כרטיסים או עסקאות בודדות."
    ]
  };
}
