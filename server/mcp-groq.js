/**
 * mcp-groq.js — Groq-backed visual reasoning for MCP tools.
 *
 * Uses Groq's OpenAI-compatible /chat/completions endpoint with a vision
 * model (default: meta-llama/llama-4-scout-17b-16e-instruct) so Claude
 * never has to inhale pixels — Groq answers natural-language questions
 * about screenshots and returns text only.
 *
 * Requires GROQ_API_KEY (either in config.secrets or process.env).
 *
 * Public API:
 *   visualQuery({ pngBase64, question, model?, maxTokens? })
 *   findElement({ pngBase64, description, model?, maxTokens? })
 *   visualDiff({ beforeBase64, afterBase64, model?, maxTokens? })
 *   verifyLoop(opts)
 *
 * `verifyLoop` is a higher-level helper — it accepts an "act" function
 * that the caller provides (e.g. a closure that takes a screenshot and
 * optionally runs an action) and iterates up to maxAttempts, asking
 * Groq whether the success condition is met.
 */

const https = require("https");

const GROQ_API_HOST = "api.groq.com";
const GROQ_API_PATH = "/openai/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_MAX_TOKENS = 1024;

function getGroqKey() {
  try {
    const { getSecret } = require("./config");
    const v = getSecret("GROQ_API_KEY", "GROQ_API_KEY");
    if (v) return v;
  } catch (_) {}
  return process.env.GROQ_API_KEY || "";
}

function hasGroq() { return !!getGroqKey(); }

/**
 * Low-level Groq chat completion call. Accepts an array of messages
 * (OpenAI format — supports image_url parts with base64 data URLs).
 */
function groqChat({ messages, model, maxTokens, temperature }) {
  return new Promise((resolve, reject) => {
    const key = getGroqKey();
    if (!key) {
      resolve({ error: "GROQ_API_KEY not set. Add it in Settings → Secrets or set the env var." });
      return;
    }

    const body = JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
      temperature: temperature != null ? temperature : 0.1
    });

    const req = https.request({
      host: GROQ_API_HOST,
      path: GROQ_API_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 60000
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({
            error: "Groq API " + res.statusCode + ": " + raw.slice(0, 600)
          });
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
          resolve({
            text: content || "",
            model: parsed.model,
            usage: parsed.usage
          });
        } catch (e) {
          resolve({ error: "Groq response parse failed: " + e.message });
        }
      });
    });

    req.on("error", (e) => resolve({ error: "Groq request failed: " + e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ error: "Groq request timed out" }); });
    req.write(body);
    req.end();
  });
}

function imagePart(base64) {
  // OpenAI / Groq vision format
  return {
    type: "image_url",
    image_url: { url: "data:image/png;base64," + base64 }
  };
}
function textPart(text) { return { type: "text", text }; }

/**
 * Ask a natural-language question about a screenshot.
 */
async function visualQuery({ pngBase64, question, model, maxTokens }) {
  if (!pngBase64) return { error: "pngBase64 required" };
  if (!question) return { error: "question required" };

  const messages = [
    {
      role: "user",
      content: [
        textPart(question),
        imagePart(pngBase64)
      ]
    }
  ];
  return groqChat({ messages, model, maxTokens });
}

/**
 * Ask Groq to locate an element in a screenshot and return its bounding box
 * (in pixel coordinates) plus a short description. The prompt constrains
 * the model to reply in a parseable JSON-ish format.
 */
async function findElement({ pngBase64, description, model, maxTokens }) {
  if (!pngBase64) return { error: "pngBase64 required" };
  if (!description) return { error: "description required" };

  const prompt =
    "Locate the element described as: \"" + description + "\" in this screenshot.\n" +
    "Respond with ONLY a compact JSON object on a single line, no prose:\n" +
    '{"found": true|false, "x": <center-x px>, "y": <center-y px>, "width": <px>, "height": <px>, "label": "<short label>", "confidence": 0.0-1.0}\n' +
    "If you cannot find it, respond with {\"found\": false}. Coordinates must be in the image pixel space (top-left is 0,0).";

  const result = await groqChat({
    messages: [{
      role: "user",
      content: [textPart(prompt), imagePart(pngBase64)]
    }],
    model, maxTokens
  });
  if (result.error) return result;

  // Try to parse JSON from the response
  const text = result.text || "";
  let parsed = null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { parsed = JSON.parse(match[0]); } catch (_) {}
  }
  return {
    description,
    raw: text,
    ...(parsed ? { location: parsed } : { parseError: "Groq response was not valid JSON" }),
    model: result.model,
    usage: result.usage
  };
}

/**
 * Ask Groq to describe what changed between two screenshots.
 */
async function visualDiff({ beforeBase64, afterBase64, model, maxTokens }) {
  if (!beforeBase64 || !afterBase64) {
    return { error: "beforeBase64 and afterBase64 are required" };
  }
  const prompt =
    "Two screenshots of the same UI. Describe what changed between them.\n" +
    "Focus on visible differences: moved elements, color/text changes, new or removed items.\n" +
    "Be concise — bullet points, no more than 10.";
  const messages = [{
    role: "user",
    content: [
      textPart(prompt),
      textPart("BEFORE:"),
      imagePart(beforeBase64),
      textPart("AFTER:"),
      imagePart(afterBase64)
    ]
  }];
  const result = await groqChat({ messages, model, maxTokens });
  if (result.error) return result;
  return { summary: result.text, model: result.model, usage: result.usage };
}

/**
 * Ask Groq whether a success condition has been met in a screenshot.
 * Returns { pass: boolean, reason: string }.
 */
async function checkCondition({ pngBase64, condition, model, maxTokens }) {
  const prompt =
    "Look at this UI screenshot and decide whether the following condition is met:\n" +
    "CONDITION: " + condition + "\n\n" +
    "Respond with ONLY a compact single-line JSON object, no prose:\n" +
    '{"pass": true|false, "reason": "<one short sentence>"}';
  const result = await groqChat({
    messages: [{
      role: "user",
      content: [textPart(prompt), imagePart(pngBase64)]
    }],
    model, maxTokens: maxTokens || 256,
    temperature: 0
  });
  if (result.error) return { pass: false, reason: result.error, error: result.error };
  const text = result.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (match) {
    try { parsed = JSON.parse(match[0]); } catch (_) {}
  }
  if (!parsed) return { pass: false, reason: "Could not parse Groq response", raw: text };
  return { pass: !!parsed.pass, reason: parsed.reason || "", raw: text };
}

/**
 * Higher-level verify loop. Runs `actAndCapture` to perform an action and
 * return a PNG, then asks Groq whether the condition passed. Repeats up to
 * maxAttempts. Stops as soon as Groq reports pass=true.
 *
 * @param {object} opts
 * @param {string} opts.condition    — natural-language success condition
 * @param {function} opts.actAndCapture — async () => { pngBase64, note? }
 * @param {number} [opts.maxAttempts=5]
 * @param {number} [opts.delayMs=800]
 * @param {string} [opts.model]
 */
async function verifyLoop(opts) {
  if (!hasGroq()) return { error: "GROQ_API_KEY not set" };
  if (!opts || !opts.condition) return { error: "condition required" };
  if (typeof opts.actAndCapture !== "function") return { error: "actAndCapture function required" };

  const maxAttempts = Math.max(1, Math.min(Number(opts.maxAttempts) || 5, 20));
  const delayMs = Math.max(0, Math.min(Number(opts.delayMs) || 800, 10000));
  const attempts = [];
  let finalScreenshot = null;

  for (let i = 0; i < maxAttempts; i++) {
    let captured;
    try {
      captured = await opts.actAndCapture(i);
    } catch (e) {
      attempts.push({ attempt: i + 1, error: "actAndCapture threw: " + e.message });
      continue;
    }
    if (!captured || !captured.pngBase64) {
      attempts.push({ attempt: i + 1, error: "actAndCapture did not return pngBase64" });
      continue;
    }
    finalScreenshot = captured.pngBase64;
    const check = await checkCondition({
      pngBase64: captured.pngBase64,
      condition: opts.condition,
      model: opts.model
    });
    attempts.push({
      attempt: i + 1,
      note: captured.note,
      pass: check.pass,
      reason: check.reason,
      raw: check.raw
    });
    if (check.pass) {
      return {
        pass: true,
        attempts: attempts.length,
        log: attempts,
        finalScreenshot
      };
    }
    if (i < maxAttempts - 1 && delayMs) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    pass: false,
    attempts: attempts.length,
    log: attempts,
    finalScreenshot
  };
}

module.exports = {
  hasGroq,
  getGroqKey,
  groqChat,
  visualQuery,
  findElement,
  visualDiff,
  checkCondition,
  verifyLoop
};
