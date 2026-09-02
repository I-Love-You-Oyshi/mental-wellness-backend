const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;



// ============================================================
// Configuration - Models (newest first)
// ============================================================

const MODELS = [
  "gemini-3.7-flash",      // newest stable (Aug 2026)
  "gemini-3.6-flash",
  "gemini-flash-latest",   // Google auto-updating alias
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite", // cheapest / fastest fallback
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
// Gemini Model Test
// ============================================================

app.get("/models", async (req, res) => {
  try {
    // Test the first (preferred) model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[0]}:generateContent?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log("Gemini Test Status:", response.status);
    console.log("Gemini Test Response:");
    console.log(JSON.stringify(data, null, 2));

    res.status(response.status).json(data);
  } catch (err) {
    console.error("Model Test Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helper: Sleep
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Helper: Call Gemini with model fallback + retry
// ============================================================

async function callGemini(contents, maxRetriesPerModel = 2) {
  let lastError = null;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contents }),
        });

        const data = await response.json();

        console.log(
          `Gemini [${model}] attempt ${attempt + 1}/${maxRetriesPerModel + 1}: ${response.status}`
        );

        // Success
        if (response.ok) {
          return {
            success: true,
            response,
            data,
            model,
          };
        }

        // Transient errors → retry this model
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          if (attempt < maxRetriesPerModel) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(
              `⚠️ ${model} temporarily unavailable (${response.status}). Retrying in ${delay}ms...`
            );
            await sleep(delay);
            continue;
          }
          // Exhausted retries for this model → try next model
          console.log(`❌ ${model} failed after retries. Trying next model...`);
          lastError = { response, data };
          break;
        }

        // Non-retryable error (400, 401, 403, etc.)
        return {
          success: false,
          response,
          data,
          model,
        };
      } catch (err) {
        console.error(`Network error on ${model} attempt ${attempt + 1}:`, err);

        if (attempt < maxRetriesPerModel) {
          const delay = Math.pow(2, attempt) * 1000;
          await sleep(delay);
        } else {
          lastError = err;
        }
      }
    }
  }

  // All models failed
  return {
    success: false,
    response: lastError?.response || null,
    data: lastError?.data || { error: { message: "All models unavailable" } },
  };
}

// ============================================================
// Mental Wellness Chat
// ============================================================

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message?.trim();

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message.",
      });
    }

    // --------------------------------------------------------
    // Conversation history
    // --------------------------------------------------------

    let history = Array.isArray(req.body.history) ? req.body.history : [];
    history = history.slice(-20); // keep only latest 20 messages

    // --------------------------------------------------------
    // Convert history into Gemini format
    // --------------------------------------------------------

    const contents = [];

    for (const item of history) {
      if (!item || !item.message) continue;

      const role = item.role === "assistant" ? "model" : "user";

      contents.push({
        role,
        parts: [{ text: String(item.message) }],
      });
    }

    // Add current user message
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    // --------------------------------------------------------
    // System instruction
    // --------------------------------------------------------

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
• Do not repeatedly use phrases such as:
  "I hear you."
  "Let's work through this together."
• Vary your language naturally.
• Do not lecture the user.
• Do not write like an academic article.

For normal conversations:

1. Acknowledge what the user shared.
2. Reflect on the situation when appropriate.
3. Give 2 to 4 practical suggestions.
4. Offer encouragement.
5. Ask one gentle follow-up question when useful.

Response length:

Normally 120 to 250 words.

Keep the conversation focused on the user's current concern.
`;

    // --------------------------------------------------------
    // Build final request
    // --------------------------------------------------------

    const requestContents = [
      {
        role: "user",
        parts: [{ text: systemInstruction }],
      },
      ...contents,
    ];

    const result = await callGemini(requestContents, 2);

    // --------------------------------------------------------
    // Handle failure
    // --------------------------------------------------------

    if (!result.success) {
      console.error("❌ Gemini API failed:");
      console.error(JSON.stringify(result.data, null, 2));

      const status = result.response?.status || 500;

      if (status === 503) {
        return res.status(503).json({
          reply:
            "I'm temporarily having trouble connecting to the AI service. Please try again in a moment.",
          temporary: true,
        });
      }

      if (status === 429) {
        return res.status(429).json({
          reply:
            "The AI service is receiving many requests right now. Please try again shortly.",
          temporary: true,
        });
      }

      return res.status(status).json({
        reply:
          "I'm having trouble generating a response right now. Please try again shortly.",
        temporary: status >= 500,
        error: result.data,
      });
    }

    // --------------------------------------------------------
    // Extract reply
    // --------------------------------------------------------

    const reply = result.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      console.error(
        "❌ Gemini returned no usable text:",
        JSON.stringify(result.data, null, 2)
      );

      return res.status(500).json({
        reply: "I couldn't generate a response right now. Please try again.",
      });
    }

    console.log(`✅ Gemini response generated successfully with model: ${result.model}`);

    return res.json({
      reply,
      model: result.model, // tells you which model actually answered
    });
  } catch (err) {
    console.error("❌ Server Error:", err);

    return res.status(500).json({
      reply:
        "Something went wrong while connecting to the AI service. Please try again.",
    });
  }
});

// ============================================================
// Start Server
// 