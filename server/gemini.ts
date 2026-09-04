export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function generateJson(prompt: string, jsonSchema: Record<string, unknown>) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    const err = new Error("missing_key");
    err.name = "ConfigError";
    throw err;
  }
  const { GoogleGenAI } = await import("@google/genai");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
    },
  });
  const text = response.text;
  if (!text?.trim()) {
    throw new Error("empty_model");
  }
  return JSON.parse(text) as unknown;
}
