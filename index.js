const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing.");
  process.exit(1);
}

// ============================================================
// Models (newest first)
// ============================================================

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

// ============================================================
// Home Route
// ============================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Health's Best Friend Backend",
    models: MODELS,
  });
});

// ============================================================
// Helpers
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(contents, maxRetriesPerModel = 2) {
  let lastError = null;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        });

        const data = await response.json();

        console.log(
          `Gemini [${model}] attempt ${attempt + 1}/${maxRetriesPerModel + 1}: ${response.status}`
        );

        if (response.ok) {
          return { success: true, response, data, model };
        }

        // Retry only on temporary errors
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          if (attempt < maxRetriesPerModel) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⚠️ ${model} unavailable. Retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          console.log(`❌ ${model} failed after retries. Trying next model...`);
          lastError = { response, data };
          break;
        }

        // Non-retryable error
        return { success: false, response, data, model };
      } catch (err) {
        console.error(`Network error on ${model}:`, err.message);
        if (attempt < maxRetriesPerModel) {
          await sleep(Math.pow(2, attempt) * 1000);
        } else {
          lastError = err;
        }
      }
    }
  }

  return {
    success: false,
    response: lastError?.response || null,
    data: lastError?.data || { error: { message: "All models unavailable" } },
  };
}

// ============================================================
// Chat Endpoint
// ============================================================

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message?.trim();

    if (!message) {
      return res.status(400).json({ reply: "Please enter a message." });
    }

    let history = Array.isArray(req.body.history) ? req.body.history : [];
    history = history.slice(-20);

    const contents = [];

    for (const item of history) {
      if (!item?.message) continue;
      const role = item.role === "assistant" ? "model" : "user";
      contents.push({
        role,
        parts: [{ text: String(item.message) }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const systemInstruction = `
You are Health's Best Friend, an AI Mental Wellness Companion.

Your purpose is to provide supportive, compassionate, practical
conversation about emotional wellbeing and everyday mental wellness.

IMPORTANT SAFETY RULES:
• Never diagnose mental illnesses.
• Never prescribe medication.
• Never claim certainty about a user's emotional or mental state.
• Do not pretend to be a doctor, psychologist, psychiatrist, or therapist.
• Encourage professional help when the situation appears serious.
• If the user indicates immediate danger, self-harm, suicide,
  or danger to another person, encourage them to contact local
  emergency services or a trusted person immediately.
• Do not provide instructions for self-harm or harming others.

CONVERSATIONAL STYLE:
• Be warm, empathetic, natural, and respectful.
• Respond like a compassionate wellness companion.
• Do not sound robotic.
• Do not repeatedly use phrases such as "I hear you." or "Let's work through this together."
• Vary your language naturally.
• Do not lecture the user.

For normal conversations:
1. Acknowledge what the user shared.
2. Reflect on the situation when appropriate.
3. Give 2 to 4 practical suggestions.
4. Offer encouragement.
5. Ask one gentle follow-up question when useful.

Response length: Normally 120 to 250 words.
Keep the conversation focused on the user's current concern.
`;

    const requestContents = [
      {
        role: "user",
        parts: [{ text: systemInstruction }],
      },
      ...contents,
    ];

    const result = await callGemini(requestContents, 2);

    if (!result.success) {
      console.error("❌ Gemini failed:", JSON.stringify(result.data, null, 2));

      const status = result.response?.status || 500;

      if (status === 503) {
        return res.status(503).json({
          reply: "I'm temporarily having trouble connecting to the AI service. Please try again in a moment.",
          temporary: true,
        });
      }

      if (status === 429) {
        return res.status(429).json({
          reply: "The AI service is receiving many requests right now. Please try again shortly.",
          temporary: true,
        });
      }

      return res.status(status).json({
        reply: "I'm having trouble generating a response right now. Please try again shortly.",
        temporary: status >= 500,
      });
    }

    const reply = result.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(500).json({
        reply: "I couldn't generate a response right now. Please try again.",
      });
    }

    console.log(`✅ Success with model: ${result.model}`);

    return res.json({
      reply,
      model: result.model,
    });
  } catch (err) {
    console.error("❌ Gemini failed:");
    console.error("Status:", result.response?.status);
    console.error("Model:", result.model);
    console.error("Response:", JSON.stringify(result.data, null, 2));
    return res.status(500).json({
      reply: "Something went wrong while connecting to the AI service. Please try again.",
    });
  }
});

// ============================================================
// Start Server
// ============================================================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Preferred models: ${MODELS.join(" → ")}`);
});