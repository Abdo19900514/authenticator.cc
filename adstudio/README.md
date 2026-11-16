# AdStudio — استوديو الإعلانات

تطبيق كتحط فيه **سمية البرودوي ولا تصويرتو** وكيعطيك:

1. **تحليل البرودوي**: نقطة من 100 وحكم (رابح / واعد / فيه المخاطرة / ما ننصحش بيه)، الإيجابيات والسلبيات، الثمن المقترح والهامش.
2. **الطريقة باش تخدم عليه**: الجمهور المستهدف، الاهتمامات ديال الاستهداف، زوايا التسويق، الخطوات من صفحة البيع حتى السكيل، والميزانية.
3. **نصوص إشهارية**: بالدارجة، العربية الفصحى والفرنسية + هاشتاغات.
4. **تصاور كرياتيف**: إلى حطيتي تصويرة البرودوي، كيتخدم بيها باش يبان البرودوي الحقيقي.
5. **فيديو إعلاني** عمودي (9:16) + سكريبت.
6. **النشر فالباج ديال فيسبوك** مباشرة (نص + تصويرة ولا فيديو).

## التشغيل

```bash
cd adstudio
npm install
cp .env.example .env   # عمر المفاتيح
npm start              # http://localhost:3000
```

## المفاتيح اللي خاصك (.env)

| المتغير | علاش | منين تجيبو |
|---|---|---|
| `ANTHROPIC_API_KEY` | التحليل، الاستراتيجية والنصوص | console.anthropic.com |
| `OPENAI_API_KEY` | التصاور والفيديو | platform.openai.com |
| `FB_PAGE_ID` | الباج اللي غادي تنشر فيها | Facebook Page → About → Page ID |
| `FB_PAGE_ACCESS_TOKEN` | النشر | developers.facebook.com → Graph API Explorer → Page token بالصلاحيات `pages_manage_posts`, `pages_read_engagement` |

> كل خدمة خدامة بوحدها: يلا ما عندكش مفتاح OpenAI مثلا، التحليل والنصوص غادي يخدمو عادي.

## Technical notes (English)

- `server.js` — Express server. Endpoints: `POST /api/analyze` (Claude, vision + structured output), `POST /api/images` (OpenAI Images, edit mode when a product photo exists), `POST /api/video` + `GET /api/video/:id` (OpenAI Videos, async job + polling), `POST /api/publish` (Facebook Graph API: `/photos`, `/videos` or `/feed`), `GET /api/config`.
- `public/` — Arabic RTL single-page UI, light/dark.
- Generated media is saved in `media/` and served at `/media/...`.
- Run it on a server (VPS, Render, Railway…) to use it from your phone. Keep `.env` private.
