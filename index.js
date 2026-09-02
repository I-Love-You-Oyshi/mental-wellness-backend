const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

console.log("1. Starting...");

const app = express();
console.log("2. Express created");

app.use(cors());
app.use(express.json());
console.log("3. Middleware added");

const API_KEY = process.env.GEMINI_API_KEY;
console.log("4. API_KEY loaded:", !!API_KEY);

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];
console.log("5. Models defined");

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Health's Best Friend Backend",
    models: MODELS,
  });
});
console.log("6. Home route added");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(contents, maxRetriesPerModel = 2) {
  // simplified for now
  return { success: false };
}
console.log("7. Helper functions defined");

app.post("/chat", async (req, res) => {
  res.json({ reply: "Debug mode - chat not fully connected yet" });
});
console.log("8. Chat route added");

const PORT = process.env.PORT || 10000;
console.log("9. About to listen on port", PORT);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Preferred models: ${MODELS.join(" → ")}`);
});

console.log("10. Listen called");