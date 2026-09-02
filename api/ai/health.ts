import { hasGeminiKey } from "../../server/gemini.js";

export default function handler() {
  return Response.json({
    ok: hasGeminiKey(),
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  });
}

export const config = {
  runtime: "nodejs",
};
