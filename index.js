const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing.");
  process.exit(1);
}

// ============================================================
// GEMINI MODELS
// ============================================================

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

// ============================================================
// ROUTES
// ============================================================

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Health's Best Friend Backend",
    models: MODELS,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timeout for one Gemini API request
async function fetchWithTimeout(url, options, timeoutMs = 45000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// GEMINI REQUEST
// ============================================================

async function callGemini(
  contents,
  systemInstruction,
  maxRetries = 1
) {
  let lastError = null;

  for (const model of MODELS) {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent?key=" +
      API_KEY;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          "--------------------------------"
        );

        console.log(
          "Trying model:",
          model,
          "Attempt:",
          attempt + 1
        );

        const response = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: systemInstruction,
                  },
                ],
              },

              contents: contents,

              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 800,
              },
            }),
          },
          45000
        );

        let data;

        try {
          data = await response.json();
        } catch (error) {
          data = {
            error: {
              message: "Invalid response from Gemini.",
            },
          };
        }

        console.log(
          "Gemini:",
          model,
          "Status:",
          response.status
        );

        // ====================================================
        // SUCCESS
        // ====================================================

        if (response.ok) {
          console.log(
            "SUCCESS with model:",
            model
          );

          console.log(
            "--------------------------------"
          );

          return {
            success: true,
            response,
            data,
            model,
          };
        }

        // ====================================================
        // ERROR
        // ====================================================

        lastError = {
          response,
          data,
          model,
        };

        console.error(
          "Gemini error:",
          JSON.stringify(data, null, 2)
        );

        // Retry temporary errors
        if (
          [429, 500, 502, 503, 504].includes(
            response.status
          )
        ) {
          if (attempt < maxRetries) {
            const delay =
              Math.pow(2, attempt) * 1000;

            console.log(
              "Retrying in",
              delay,
              "ms..."
            );

            await sleep(delay);

            continue;
          }

          console.log(
            "Model failed:",
            model
          );

          break;
        }

        // Authentication or invalid request
        return {
          success: false,
          response,
          data,
          model,
        };

      } catch (error) {
        console.error(
          "Network or timeout error:",
          model,
          error.message
        );

        lastError = {
          response: null,
          data: {
            error: {
              message: error.message,
            },
          },
          model,
        };

        if (attempt < maxRetries) {
          const delay =
            Math.pow(2, attempt) * 1000;

          console.log(
            "Retrying after",
            delay,
            "ms..."
          );

          await sleep(delay);
        }
      }
    }
  }

  return {
    success: false,

    response: lastError
      ? lastError.response
      : null,

    data: lastError
      ? lastError.data
      : {
          error: {
            message:
              "All Gemini models failed.",
          },
        },

    model: lastError
      ? lastError.model
      : null,
  };
}

// ============================================================
// CHAT ENDPOINT
// ============================================================

app.post("/chat", async (req, res) => {
  const requestStart = Date.now();

  try {
    console.log(
      "================================"
    );

    console.log(
      "NEW CHAT REQUEST RECEIVED"
    );

    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message.",
      });
    }

    console.log(
      "User message:",
      message.substring(0, 100)
    );

    let history = Array.isArray(
      req.body.history
    )
      ? req.body.history
      : [];

    history = history.slice(-20);

    console.log(
      "History messages:",
      history.length
    );

    // ========================================================
    // BUILD CONVERSATION
    // ========================================================

    const contents = [];

    for (const item of history) {
      if (!item || !item.message) {
        continue;
      }

      const role =
        item.role === "assistant"
          ? "model"
          : "user";

      contents.push({
        role,
        parts: [
          {
            text: String(item.message),
          },
        ],
      });
    }

    contents.push({
      role: "user",
      parts: [
        {
          text: message,
        },
      ],
    });

    // ========================================================
    // SYSTEM INSTRUCTION
    // ========================================================

    const systemInstruction = `
You are Health's Best Friend, an AI Mental Wellness Companion.

Your purpose is to provide supportive, compassionate, practical
conversation about emotional wellbeing and everyday mental wellness.

IMPORTANT SAFETY RULES:

- Never diagnose mental illnesses.
- Never prescribe medication.
- Never claim certainty about a user's emotional or mental state.
- Do not pretend to be a doctor, psychologist, psychiatrist, or therapist.
- Encourage professional help when the situation appears serious.
- If the user indicates immediate danger, self-harm, suicide,
  or danger to another person, encourage them to contact local
  emergency services or a trusted person immediately.
- Do not provide instructions for self-harm or harming others.

CONVERSATIONAL STYLE:

- Be warm, empathetic, natural, and respectful.
- Respond like a compassionate wellness companion.
- Do not sound robotic.
- Do not lecture the user.
- Vary your language naturally.
- Avoid repeating the same phrases.

FOR NORMAL CONVERSATIONS:

You should provide a helpful and reasonably detailed response.

For most user messages, follow this structure naturally:

1. Briefly acknowledge what the user is experiencing.
2. Explain possible everyday reasons or contributing factors without diagnosing.
3. Give 3 to 5 practical, realistic suggestions.
4. Offer gentle encouragement.
5. Ask one thoughtful follow-up question to continue the conversation.

Do not give extremely short responses.

Unless the user's message is very short and only requires a simple answer,
your response should usually contain approximately 150 to 300 words.

For concerns such as stress, anxiety, sadness, sleep problems,
motivation, loneliness, overthinking, or emotional exhaustion,
provide practical steps that the user can try today.

Avoid generic responses such as:

"I'm sorry you're dealing with this."
"I hear you."
"That sounds difficult."

Do not stop after only acknowledging the user's feelings.
Always try to provide useful, practical support and guidance.

Keep the response conversational, warm, and natural.
`;

    // ========================================================
    // CALL GEMINI
    // ========================================================

    const result = await callGemini(
      contents,
      systemInstruction,
      1
    );

    // ========================================================
    // FAILURE
    // ========================================================

    if (!result.success) {
      const status =
        result.response &&
        result.response.status
          ? result.response.status
          : 500;

      const errorMessage =
        result.data &&
        result.data.error &&
        result.data.error.message
          ? result.data.error.message
          : "Unknown Gemini error.";

      console.error(
        "GEMINI REQUEST FAILED"
      );

      console.error(
        "Model:",
        result.model
      );

      console.error(
        "Status:",
        status
      );

      console.error(
        "Error:",
        errorMessage
      );

      console.log(
        "================================"
      );

      if (
        status === 401 ||
        status === 403
      ) {
        return res.status(status).json({
          reply:
            "The AI service authentication failed.",
          temporary: false,
        });
      }

      if (status === 429) {
        return res.status(429).json({
          reply:
            "The AI service is currently busy. Please try again shortly.",
          temporary: true,
        });
      }

      if (status === 503) {
        return res.status(503).json({
          reply:
            "The AI service is temporarily unavailable. Please try again in a moment.",
          temporary: true,
        });
      }

      return res.status(500).json({
        reply:
          "I'm having trouble generating a response right now. Please try again shortly.",
        temporary: true,
      });
    }

    // ========================================================
    // EXTRACT RESPONSE
    // ========================================================

    const candidates =
      Array.isArray(result.data.candidates)
        ? result.data.candidates
        : [];

    const parts =
      candidates.length > 0 &&
      candidates[0].content &&
      Array.isArray(
        candidates[0].content.parts
      )
        ? candidates[0].content.parts
        : [];

    const reply = parts
      .map((part) =>
        typeof part.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();

    if (!reply) {
      console.error(
        "Gemini returned an empty response."
      );

      console.error(
        JSON.stringify(
          result.data,
          null,
          2
        )
      );

      return res.status(500).json({
        reply:
          "I couldn't generate a response right now. Please try again.",
        temporary: true,
      });
    }

    const totalTime =
      Date.now() - requestStart;

    console.log(
      "REQUEST COMPLETED"
    );

    console.log(
      "Model:",
      result.model
    );

    console.log(
      "Time:",
      totalTime + "ms"
    );

    console.log(
      "================================"
    );

    return res.status(200).json({
      reply,
      model: result.model,
      responseTime: totalTime,
    });

  } catch (error) {
    console.error(
      "================================"
    );

    console.error(
      "SERVER ERROR"
    );

    console.error(error);

    console.error(
      "================================"
    );

    return res.status(500).json({
      reply:
        "Something went wrong while connecting to the AI service. Please try again.",
      temporary: true,
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT =
  process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(
    "Health's Best Friend Backend running on port " +
      PORT
  );

  console.log(
    "Gemini models: " +
      MODELS.join(" -> ")
  );
});