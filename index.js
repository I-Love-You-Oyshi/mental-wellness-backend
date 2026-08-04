const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Health's Best Friend AI Backend is running.");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

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
- Encourage professional help if someone appears in crisis.
- Keep responses under 180 words.
- Use simple language.
- Focus on stress, anxiety, motivation, sleep, emotions, and self-care.

User:
${message}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const reply =
        response.text ||
        "I'm here for you. Could you tell me a little more?";

    res.json({
      reply,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      reply: "Internal server error.",
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});