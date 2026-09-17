require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

const AI_API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL =
  process.env.AI_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const AI_REFERER = process.env.AI_REFERER || "";
const AI_TITLE = process.env.AI_TITLE || "";

if (!AI_API_KEY) {
  console.warn("⚠️  AI_API_KEY / GROQ_API_KEY تنظیم نشده است. فایل .env را بررسی کنید.");
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim());

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  })
);
app.use(express.json({ limit: "2mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تعداد درخواست‌ها زیاد است. کمی صبر کنید." },
});
app.use("/api/", limiter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "protranslate-ai-backend", model: AI_MODEL });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, max_tokens = 800, temperature = 0.6 } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages نامعتبر است" });
    }

    const headers = {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (AI_REFERER) headers["HTTP-Referer"] = AI_REFERER;
    if (AI_TITLE) headers["X-Title"] = AI_TITLE;

    const aiRes = await fetch(AI_BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        max_tokens,
        temperature,
      }),
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      return res.status(aiRes.status).json({
        error: data?.error?.message || "خطا در ارتباط با سرویس هوش مصنوعی",
      });
    }

    const answer = data?.choices?.[0]?.message?.content || "";
    res.json({ answer, raw: undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطای داخلی سرور" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ بک‌اند ترجمه‌گر حرفه‌ای روی پورت ${PORT} اجرا شد (مدل: ${AI_MODEL})`);
});
