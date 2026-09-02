const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is missing.");
  process.exit(1);
}

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite"
];

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Health's Best Friend Backend",
    models: MODELS
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(contents, systemInstruction, maxRetries = 2) {
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
          "Trying model:",
          model,
          "Attempt:",
          attempt + 1
        );

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: systemInstruction
                }
              ]
            },
            contents: contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 500
            }
          })
        });

        let data;

        try {
          data = await response.json();
        } catch (error) {
          data = {
            error: {
              message: "Invalid response from Gemini."
            }
          };
        }

        console.log(
          "Gemini:",
          model,
          "Status:",
          response.status
        );

        if (response.ok) {
          return {
            success: true,
            response: response,
            data: data,
            model: model
          };
        }

        lastError = {
          response: response,
          data: data,
          model: model
        };

        console.error(
          "Gemini error:",
          JSON.stringify(data, null, 2)
        );

        if ([429, 500, 502, 503, 504].includes(response.status)) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;

            console.log(
              "Retrying in",
              delay,
              "ms..."
            );

            await sleep(delay);
            continue;
          }

          console.log(
            model,
            "failed. Trying next model."
          );

          break;
        }

        return {
          success: false,
          response: response,
          data: data,
          model: model
        };

      } catch (error) {
        console.error(
          "Network error:",
          model,
          error.message
        );

        lastError = {
          response: null,
          data: {
            error: {
              message: error.message
            }
          },
          model: model
        };

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;

          await sleep(delay);
        }
      }
    }
  }

  return {
    success: false,
    response: lastError ? lastError.response : null,
    data: lastError
      ? lastError.data
      : {
          error: {
            message: "All Gemini models failed."
          }
        },
    model: lastError ? lastError.model : null
  };
}

app.post("/chat", async (req, res) => {
  try {
    const message =
      typeof req.body.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message."
      });
    }

    let history = Array.isArray(req.body.history)
      ? req.body.history
      : [];

    history = history.slice(-20);

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
        role: role,
        parts: [
          {
            text: String(item.message)
          }
        ]
      });
    }

    contents.push({
      role: "user",
      parts: [
        {
          text: message
        }
      ]
    });

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
- Do not repeatedly use phrases such as "I hear you."
- Do not repeatedly use phrases such as
  "Let's work through this together."
- Vary your language naturally.
- Do not lecture the user.

FOR NORMAL CONVERSATIONS:

1. Acknowledge what the user shared.
2. Reflect on the situation when appropriate.
3. Give 2 to 4 practical suggestions when useful.
4. Offer encouragement.
5. Ask one gentle follow-up question when useful.

Keep the conversation focused on the user's current concern.

Normal response length:
120 to 250 words.
`;

    const result = await callGemini(
      contents,
      systemInstruction,
      2
    );

    if (!result.success) {
      const status =
        result.response && result.response.status
          ? result.response.status
          : 500;

      const errorMessage =
        result.data &&
        result.data.error &&
        result.data.error.message
          ? result.data.error.message
          : "Unknown Gemini error.";

      console.error("--------------------------------");
      console.error("GEMINI REQUEST FAILED");
      console.error("Model:", result.model);
      console.error("Status:", status);
      console.error("Error:", errorMessage);
      console.error(
        JSON.stringify(result.data, null, 2)
      );
      console.error("--------------------------------");

      if (status === 401 || status === 403) {
        return res.status(status).json({
          reply:
            "The AI service authentication failed.",
          temporary: false
        });
      }

      if (status === 429) {
        return res.status(429).json({
          reply:
            "The AI service is currently receiving many requests. Please try again shortly.",
          temporary: true
        });
      }

      if (status === 503) {
        return res.status(503).json({
          reply:
            "The AI service is temporarily unavailable. Please try again in a moment.",
          temporary: true
        });
      }

      return res.status(500).json({
        reply:
          "I'm having trouble generating a response right now. Please try again shortly.",
        temporary: true
      });
    }

    const candidates =
      result.data &&
      Array.isArray(result.data.candidates)
        ? result.data.candidates
        : [];

    const parts =
      candidates.length > 0 &&
      result.data.candidates[0].content &&
      Array.isArray(
        result.data.candidates[0].content.parts
      )
        ? result.data.candidates[0].content.parts
        : [];

    const reply = parts
      .map((part) => {
        return typeof part.text === "string"
          ? part.text
          : "";
      })
      .join("")
      .trim();

    if (!reply) {
      console.error(
        "Gemini returned no text."
      );

      console.error(
        JSON.stringify(result.data, null, 2)
      );

      return res.status(500).json({
        reply:
          "I couldn't generate a response right now. Please try again.",
        temporary: true
      });
    }

    console.log(
      "SUCCESS with model:",
      result.model
    );

    return res.status(200).json({
      reply: reply,
      model: result.model
    });

  } catch (error) {
    console.error("--------------------------------");
    console.error("SERVER ERROR");
    console.error(error);
    console.error("--------------------------------");

    return res.status(500).json({
      reply:
        "Something went wrong while connecting to the AI service. Please try again.",
      temporary: true
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(
    "Health's Best Friend Backend running on port " + PORT
  );

  console.log(
    "Gemini models: " + MODELS.join(" -> ")
  );
});