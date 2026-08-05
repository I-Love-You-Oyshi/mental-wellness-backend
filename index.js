const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY;

// -------------------------------
// Home Route
// -------------------------------
app.get("/", (req, res) => {
  res.send("✅ Health's Best Friend Backend is Running");
});

// -------------------------------
// List Available Gemini Models
// -------------------------------
app.get("/models", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
    );

    const data = await response.json();

    console.log("Available Models:");
    console.log(JSON.stringify(data, null, 2));

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// -------------------------------
// Mental Wellness Chat
// -------------------------------
app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message."
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `You are an empathetic mental wellness assistant inside Health's Best Friend.

Rules:
- Be supportive.
- Never diagnose diseases.
- Never prescribe medicine.
- Encourage professional help in emergencies.
- Keep replies under 180 words.`
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: message
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        reply: data.error?.message || "Gemini API Error"
      });
    }

    res.json({
      reply:
        data.candidates?.[0]?.content?.parts?.[0]?.text ??
        "I'm here for you."
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      reply: e.toString()
    });
  }
});