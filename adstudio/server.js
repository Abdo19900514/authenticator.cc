// AdStudio — product analysis, creative images, video, ad copy and Facebook Page publishing.
import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(here, "media");
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const PORT = Number(process.env.PORT || 3000);
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL || "sora-2";
const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v23.0";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(here, "public")));
app.use("/media", express.static(MEDIA_DIR));

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function saveMedia(buffer, ext) {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), buffer);
  return `/media/${name}`;
}

function mediaPathFromUrl(url) {
  // Only allow files inside our own media folder.
  const name = path.basename(String(url || ""));
  const full = path.join(MEDIA_DIR, name);
  if (!name || !fs.existsSync(full)) throw new Error("الملف ما كاينش (media file not found)");
  return full;
}

function requireKey(name) {
  if (!process.env[name]) {
    const err = new Error(`خاصك تزيد ${name} فـ ملف .env`);
    err.status = 400;
    throw err;
  }
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// ---------------------------------------------------------------------------
// 1) Product analysis + strategy + ad copy (Claude)
// ---------------------------------------------------------------------------
const AnalysisSchema = z.object({
  product_name: z.string(),
  product_summary: z.string(),
  category: z.string(),
  winning_score: z.number().describe("0-100 score of how likely the product sells well in e-commerce right now"),
  verdict: z.enum(["winning", "promising", "risky", "not_recommended"]),
  verdict_explanation: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  wow_factor: z.string(),
  problem_it_solves: z.string(),
  target_audience: z.object({
    age_range: z.string(),
    gender: z.string(),
    interests: z.array(z.string()),
    pain_points: z.array(z.string()),
  }),
  pricing: z.object({
    estimated_cost: z.string(),
    suggested_price: z.string(),
    margin_note: z.string(),
  }),
  marketing_angles: z.array(z.object({ angle: z.string(), hook: z.string() })),
  strategy_steps: z.array(z.object({ step: z.string(), details: z.string() })),
  ad_budget_plan: z.string(),
  ad_copies: z.array(
    z.object({
      language: z.string(),
      style: z.string(),
      headline: z.string(),
      primary_text: z.string(),
      call_to_action: z.string(),
    }),
  ),
  hashtags: z.array(z.string()),
  image_prompts: z.array(z.string()).describe("English prompts for an AI image model, ad-ready product creatives"),
  video_prompt: z.string().describe("English prompt for an AI video model, 8-12s vertical ad"),
  video_script: z.array(z.object({ seconds: z.string(), scene: z.string(), voiceover: z.string() })),
});

const SYSTEM_PROMPT = `You are a senior e-commerce product researcher and direct-response ad strategist
for dropshipping and online stores, with deep knowledge of the Moroccan, North African and Arab markets
(cash on delivery, Facebook/Instagram/TikTok ads, prices in MAD).
Analyse the product the user gives (name and/or photo) honestly: do not hype a weak product.
Score it on: wow factor, problem solved, broad market, margin potential (price ≥ 3x cost), not easily
found in local stores, easy to show in a video, low shipping/return risk, competition and saturation.

Writing rules:
- Write every human-facing explanation (summary, pros, cons, strategy, etc.) in Moroccan Darija written in Arabic script, clear and practical.
- ad_copies: give at least 4 variations: 2 in Moroccan Darija (Arabic script), 1 in Modern Standard Arabic, 1 in French. Use emojis tastefully, strong hooks, benefits over features, urgency, and a COD/delivery mention when relevant.
- image_prompts: 4 distinct English prompts (lifestyle, studio hero shot, problem/solution, social-proof/UGC style). Describe the product precisely so the image model renders it faithfully. No text in the image.
- video_prompt: one English prompt for a vertical 9:16 short ad with camera moves and a clear hook in the first 2 seconds.
- strategy_steps: a concrete launch plan from store page to testing to scaling.
- Prices in MAD unless the user says otherwise.`;

app.post("/api/analyze", upload.single("image"), async (req, res, next) => {
  try {
    if (!anthropic) requireKey("ANTHROPIC_API_KEY");
    const name = (req.body.name || "").trim();
    const notes = (req.body.notes || "").trim();
    if (!name && !req.file) return res.status(400).json({ error: "عطيني سمية البرودوي ولا تصويرتو" });

    const content = [];
    let imageUrl = null;
    if (req.file) {
      if (!SUPPORTED_IMAGE_TYPES.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "نوع التصويرة خاصو يكون JPG ولا PNG ولا WEBP" });
      }
      imageUrl = saveMedia(req.file.buffer, req.file.mimetype.split("/")[1].replace("jpeg", "jpg"));
      content.push({
        type: "image",
        source: { type: "base64", media_type: req.file.mimetype, data: req.file.buffer.toString("base64") },
      });
    }
    content.push({
      type: "text",
      text: [
        name ? `Product name: ${name}` : "Product name: (identify it from the photo)",
        notes ? `Extra notes from the seller: ${notes}` : "",
        "Analyse this product and produce the full report.",
      ].filter(Boolean).join("\n"),
    });

    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium", format: zodOutputFormat(AnalysisSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return res.status(422).json({ error: "ما قدرتش نحلل هاد البرودوي." });
    }
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No analysis returned");
    const analysis = AnalysisSchema.parse(JSON.parse(textBlock.text));
    res.json({ analysis, productImage: imageUrl });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 2) Creative images (OpenAI Images API)
// ---------------------------------------------------------------------------
app.post("/api/images", async (req, res, next) => {
  try {
    requireKey("OPENAI_API_KEY");
    const { prompt, productImage, size = "1024x1024" } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt ناقص" });

    let response;
    if (productImage) {
      // Edit mode: keep the real product, change the scene around it.
      const file = mediaPathFromUrl(productImage);
      const ext = path.extname(file).slice(1).replace("jpg", "jpeg");
      const form = new FormData();
      form.append("model", OPENAI_IMAGE_MODEL);
      form.append("prompt", `${prompt}\nKeep the product from the reference photo exactly as it is (shape, colors, logo). High-end advertising photography, no added text.`);
      form.append("size", size);
      form.append("image", new Blob([fs.readFileSync(file)], { type: `image/${ext}` }), path.basename(file));
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size, n: 1 }),
      });
    }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error?.message || "Image generation failed"), { status: 502 });
    const b64 = data.data?.[0]?.b64_json;
    let url;
    if (b64) url = saveMedia(Buffer.from(b64, "base64"), "png");
    else if (data.data?.[0]?.url) {
      const img = await fetch(data.data[0].url);
      url = saveMedia(Buffer.from(await img.arrayBuffer()), "png");
    } else throw new Error("No image returned");
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 3) Video (OpenAI Videos API) — start a job, then poll it
// ---------------------------------------------------------------------------
app.post("/api/video", async (req, res, next) => {
  try {
    requireKey("OPENAI_API_KEY");
    const { prompt, seconds = "8", size = "720x1280", referenceImage } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt ناقص" });
    const form = new FormData();
    form.append("model", OPENAI_VIDEO_MODEL);
    form.append("prompt", prompt);
    form.append("seconds", String(seconds));
    form.append("size", size);
    if (referenceImage) {
      const file = mediaPathFromUrl(referenceImage);
      const ext = path.extname(file).slice(1).replace("jpg", "jpeg");
      form.append("input_reference", new Blob([fs.readFileSync(file)], { type: `image/${ext}` }), path.basename(file));
    }
    const response = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error?.message || "Video generation failed"), { status: 502 });
    res.json({ id: data.id, status: data.status });
  } catch (err) {
    next(err);
  }
});

app.get("/api/video/:id", async (req, res, next) => {
  try {
    requireKey("OPENAI_API_KEY");
    const id = encodeURIComponent(req.params.id);
    const auth = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    const response = await fetch(`https://api.openai.com/v1/videos/${id}`, { headers: auth });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error?.message || "Video status failed"), { status: 502 });
    if (data.status !== "completed") {
      return res.json({ status: data.status, progress: data.progress ?? null, error: data.error?.message });
    }
    const file = await fetch(`https://api.openai.com/v1/videos/${id}/content`, { headers: auth });
    if (!file.ok) throw new Error("Video download failed");
    const url = saveMedia(Buffer.from(await file.arrayBuffer()), "mp4");
    res.json({ status: "completed", url });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 4) Publish to a Facebook Page (Graph API)
// ---------------------------------------------------------------------------
app.get("/api/config", (_req, res) => {
  res.json({
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    facebook: Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN),
  });
});

app.post("/api/publish", async (req, res, next) => {
  try {
    requireKey("FB_PAGE_ID");
    requireKey("FB_PAGE_ACCESS_TOKEN");
    const { message = "", mediaUrl, mediaType } = req.body;
    const base = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(process.env.FB_PAGE_ID)}`;
    const form = new FormData();
    form.append("access_token", process.env.FB_PAGE_ACCESS_TOKEN);
    let endpoint;
    if (mediaUrl) {
      const file = mediaPathFromUrl(mediaUrl);
      const blob = new Blob([fs.readFileSync(file)]);
      if (mediaType === "video") {
        endpoint = `${base}/videos`;
        form.append("description", message);
        form.append("source", blob, path.basename(file));
      } else {
        endpoint = `${base}/photos`;
        form.append("message", message);
        form.append("source", blob, path.basename(file));
      }
    } else {
      endpoint = `${base}/feed`;
      form.append("message", message);
    }
    const response = await fetch(endpoint, { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error?.message || "Facebook publish failed"), { status: 502 });
    res.json({ ok: true, id: data.post_id || data.id });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  if (err instanceof Anthropic.AuthenticationError) status = 401;
  else if (err instanceof Anthropic.RateLimitError) status = 429;
  else if (err instanceof Anthropic.APIError) status = 502;
  console.error(err);
  res.status(status).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => console.log(`AdStudio running on http://localhost:${PORT}`));
