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
// Render پشت یک پروکسی معکوس اجرا می‌شود؛ این تنظیم به Express می‌گوید
// به هدر X-Forwarded-For اعتماد کند تا express-rate-limit خطا ندهد
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// پشتیبانی از چند سرویس هوش مصنوعی: به‌صورت پیش‌فرض Groq، ولی اگر
// AI_API_KEY تنظیم شده باشد (مثلاً برای OpenRouter) همان استفاده می‌شود.
const AI_API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY;
const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://api.groq.com/openai/v1/chat/completions";
const AI_MODEL =
  process.env.AI_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
// برخی سرویس‌ها مثل OpenRouter به این هدرها نیاز دارند (اختیاری)
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
  res.json({ ok: true, service: "protranslate-ai-backend", model: AI_MODEL });
});

/**
 * بدنه درخواست:
 * { messages: [{role, content}, ...], max_tokens?: number, temperature?: number, stream?: boolean }
 * وقتی stream=true باشد، پاسخ به‌صورت جریانی (SSE) همانند خودِ OpenAI/OpenRouter
 * پس‌فرستاده می‌شود تا شروع پاسخ در همان لحظه اول روی گوشی دیده شود، نه بعد از
 * تمام‌شدن کل تولید متن.
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, max_tokens = 500, temperature = 0.6, stream = false } = req.body;

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
        stream: !!stream,
      }),
    });

    if (stream) {
      if (!aiRes.ok || !aiRes.body) {
        let msg = "خطا در ارتباط با سرویس هوش مصنوعی";
        try {
          const errData = await aiRes.json();
          msg = errData?.error?.message || msg;
        } catch (_) {}
        return res.status(aiRes.status || 500).json({ error: msg });
      }
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (streamErr) {
        console.error("stream relay error:", streamErr?.message || streamErr);
      } finally {
        res.end();
      }
      return;
    }

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
