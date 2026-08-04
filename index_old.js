// index.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch"); // Required for Node.js CommonJS

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// HuggingFace Chat Endpoint
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: "No message provided" });
  }

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/distilgpt2", // choose your HF model
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: userMessage,
          parameters: { max_new_tokens: 100 }
        })
      }
    );

    const data = await response.json();

    if (response.ok && Array.isArray(data) && data[0]?.generated_text) {
      return res.json({ reply: data[0].generated_text });
    } else {
      console.error("HuggingFace API error:", data);
      return res.json({ reply: "AI service temporarily unavailable. Try again later." });
    }

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ reply: "Server error. Please try again later." });
  }
});

// Port configuration for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Mental Wellness backend running on port ${PORT}`);
});
