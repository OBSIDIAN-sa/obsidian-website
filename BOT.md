# مساعد أوبسيديان (البوت)

## ما هو
- **للعملاء** — نافذة محادثة في الموقع (`assets/js/bot.js`, `assets/css/bot.css`): أسئلة شائعة، تسجيل طلب، حجز زيارة للمعرض، وأسئلة حرة يجاوب عليها الذكاء الاصطناعي من معلومات أوبسيديان فقط.
- **للفريق** — صفحة `/staff/` بتسجيل دخول: ملخص، الطلبات وحالتها وملاحظاتها وإسنادها، المواعيد وتأكيدها، إضافة طلب يدوي، إدارة الموظفين (للمدير)، وسؤال حر عن البيانات.
- **الخلفية** — `functions/api/[[path]].js` (Cloudflare Pages Functions) + قاعدة D1 (`schema.sql`) + Workers AI.

## قواعد ثابتة
- لا أسعار، لا مدد تنفيذ، لا شروط دفع — لا في الأزرار ولا من الذكاء الاصطناعي (فيه فلتر في الخادم يرفض أي رد فيه رقم سعر أو مدة).
- معلومات البوت مصدرها `CONTENT.md`. أي تعديل: هناك أولاً، ثم `functions/_lib/kb.js` و`assets/js/bot.js`.
- أوقات الحجز في `functions/_lib/kb.js` (`HOURS`). أول يوم متاح للحجز: المتغير `BOOK_FROM` في `wrangler.toml`.

## النشر (مرة واحدة)
1. `npx wrangler d1 create obsidian-bot` ثم ضع الـ `database_id` في `wrangler.toml`.
2. `npx wrangler d1 execute obsidian-bot --remote --file=schema.sql`
3. `npx wrangler pages secret put SETUP_KEY` (كلمة سرية تُستخدم مرة واحدة لإنشاء حساب المدير).
4. `npx wrangler pages deploy` — السحب والإفلات من لوحة Cloudflare لا ينشر مجلد `functions/`.
5. افتح `/staff/` وأنشئ حساب المدير بمفتاح الإعداد، ثم أضف الموظفين من «الموظفون».

## التجربة محلياً
```
echo "SETUP_KEY=local-setup-key" > .dev.vars
npx wrangler d1 execute obsidian-bot --local --file=schema.sql
npx wrangler pages dev .
```
ربط الذكاء الاصطناعي (`[ai]`) يحتاج تسجيل دخول Cloudflare؛ بدونه البوت يشتغل ويرجع للإجابات الجاهزة.

## الحدود
- Workers AI المجاني: 10,000 Neuron في اليوم. بعدها الأسئلة الحرة ترجع للإجابات الجاهزة تلقائياً، والأزرار والحجز تشتغل عادي.
- لكل زائر 40 سؤال حر في اليوم، وللموقع كله `AI_DAILY_CAP` (250).
