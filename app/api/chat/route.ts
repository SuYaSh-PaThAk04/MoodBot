import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in environment variables." },
      { status: 500 }
    );
  }

  const { systemPrompt, userMessage } = await req.json();

  if (!systemPrompt || !userMessage) {
    return NextResponse.json(
      { error: "systemPrompt and userMessage are required." },
      { status: 400 }
    );
  }

  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: systemPrompt + "\n\nUser: " + userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 450,
      },
    }),
  });

  const data = await geminiRes.json();

  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 500 });
  }

  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return NextResponse.json({ text });
}
