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

// --------------------------------
// Home Route
// --------------------------------
app.get("/", (req, res) => {
  res.send("✅ Health's Best Friend Backend is Running");
});

// --------------------------------
// Test Gemini API
// --------------------------------
app.get("/models", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );

    const data = await response.json();

    res.status(response.status).json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// --------------------------------
// Mental Wellness Chat
// --------------------------------
app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message?.trim();

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message.",
      });
    }

    const prompt = `
You are an empathetic AI mental wellness assistant inside the "Health's Best Friend" application.

Rules:
- Be supportive and calm.
- Never diagnose diseases.
- Never prescribe medicine.
- Encourage professional help if someone appears in crisis.
- Keep responses under 180 words.
- Use simple English.
- Focus on stress, anxiety, motivation, sleep, emotions and self-care.

User:
${message}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log("Gemini Response:");
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        reply: data.error?.message || "Gemini API Error",
        error: data,
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm here for you. Tell me a little more.";

    res.json({
      reply,
    });
  } catch (err) {
    console.error("Server Error:", err);

    res.status(500).json({
      reply: err.message,
    });
  }
});

// --------------------------------
// Start Server
// --------------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});