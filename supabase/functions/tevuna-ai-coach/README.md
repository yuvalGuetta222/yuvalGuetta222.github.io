# תבונה AI - Cloudflare Workers AI

יועץ תבונה משתמש ב-**Cloudflare Workers AI** באמצעות Supabase Edge Function מאובטחת בשם `tevuna-ai-coach`. לא נדרש מפתח OpenAI ולא קיימת תלות ב-OpenAI API.

## הפעלה חד-פעמית בחשבון Cloudflare

1. היכנסו ללוח Cloudflare ולחצו **Workers AI → Use REST API**.
2. העתיקו את **Account ID** וצרו **Workers AI API Token** עם ההרשאות המינימליות המתאימות ל-Workers AI.
3. בתוך Supabase Dashboard של פרויקט תבונה, ב-**Edge Functions → Secrets**, הגדירו:
   - `CLOUDFLARE_ACCOUNT_ID`: מזהה החשבון.
   - `CLOUDFLARE_API_TOKEN`: טוקן Workers AI.
4. רעננו את תבונה, היכנסו ל-״יועץ AI״ וודאו שהחיבור מזוהה.

**לעולם אין לשלוח את הטוקן בהודעות, להעלות אותו ל-GitHub או לשמור אותו בדפדפן.** הטוקן נשמר אך ורק בסודות השרת ומועבר ממנו ל-Cloudflare באמצעות HTTPS.

## תוכנית חינמית

Cloudflare Workers AI כוללת 10,000 Neurons ליום ללא חיוב בחשבון Workers Free, בהתאם לתנאים הנוכחיים של Cloudflare (אוקטובר 2026). כשמגיעים למכסה, פעולות נוספות נדחות בחשבון Free ולא מחייבות אוטומטית. לא עוברים למסלול בתשלום.

המודל: `@cf/meta/llama-3.1-8b-instruct`. בנוסף מוגבלת האפליקציה ל-25 בקשות לכל משתמש ביום באמצעות SQL בצד השרת.

תיעוד רשמי: https://developers.cloudflare.com/workers-ai/platform/pricing/ וכן https://developers.cloudflare.com/workers-ai/get-started/rest-api/

## פרטיות ואמינות

- גישה דרך JWT, Supabase Auth, חברות במשק הבית ו-RLS.
- השאילתות מחזירות סיכומי קטגוריות, הוצאות נטו אחרי זיכויים, הכנסות ותקציבים לחודש הנבחר ולקודמו.
- **לא נשלחים למודל** קובצי Excel, עסקאות בודדות, שמות בתי עסק, פרטי משתמשים או מספרי כרטיסי אשראי.
- אי-התאמות בבקרת דוחות מסומנות בחודשים שנבדקים. המודל מתבקש להימנע ממסקנות חד-משמעיות על נתונים חלקיים.
- אין ל-AI הרשאה לשנות הוצאות, תקציבים או הכנסות. אין שמירת שיחות AI במסד הנתונים.
- כשלא קיימים סודות Cloudflare, מסך ה-AI מציג שהשירות אינו מחובר, במקום להמציא תשובה.

## בדיקות

מריצים `node --test finance/*.test.mjs`; GitHub Actions בודק את האתר לאחר שינוי. מומלץ לבצע ניסיון מעשי של בקשת AI לאחר הגדרת הסודות כדי לאמת קריאה חיצונית ל-Cloudflare.
