/**
 * ترجمه‌گر حرفه‌ای (Pro Translator AI) — بک‌اند پروکسی امن
 * -------------------------------------------------------
 * این سرور کلید Groq API را مخفی نگه می‌دارد و فقط درخواست‌های
 * مجاز (چت، ترجمه) را با نرخ محدود (rate limit) به Groq ارسال می‌کند.
 *
 * اجرا:
 *   1) cp .env.example .env  و کلید Groq خود را بگذارید
 *   2) npm install
 *   3) npm start
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

if (!GROQ_API_KEY) {
  console.warn("⚠️  GROQ_API_KEY تنظیم نشده است. فایل .env را بررسی کنید.");
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

// محدودیت نرخ درخواست برای جلوگیری از سوءاستفاده از کلید API
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تعداد درخواست‌ها زیاد است. کمی صبر کنید." },
});
app.use("/api/", limiter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "protranslate-ai-backend" });
});

/**
 * بدنه درخواست:
 * { messages: [{role, content}, ...], max_tokens?: number, temperature?: number }
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, max_tokens = 800, temperature = 0.6 } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages نامعتبر است" });
    }

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          max_tokens,
          temperature,
        }),
      }
    );

    const data = await groqRes.json();

    if (!groqRes.ok) {
      return res.status(groqRes.status).json({
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
  console.log(`✅ بک‌اند ترجمه‌گر حرفه‌ای روی پورت ${PORT} اجرا شد`);
});
