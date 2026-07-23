import { NextResponse, type NextRequest } from "next/server";

import {
  askAssistant,
  AssistantNotConfiguredError,
  type AssistantTurn,
} from "@/lib/server/assistant";

// Auth-gated by src/proxy.ts — an unauthenticated request never reaches here.
export const dynamic = "force-dynamic";
/** Reads several tables and then calls the model; needs headroom. */
export const maxDuration = 60;

/** Keep the payload sane: a chat, not a document dump. */
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

function parseHistory(body: unknown): AssistantTurn[] | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const turns: AssistantTurn[] = [];
  for (const raw of messages.slice(-MAX_TURNS)) {
    if (typeof raw !== "object" || raw === null) return null;
    const role = (raw as { role?: unknown }).role;
    const content = (raw as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;
    turns.push({ role, content: trimmed.slice(0, MAX_CHARS) });
  }

  // The model requires the conversation to end on a user turn.
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const history = parseHistory(body);
  if (!history) {
    return NextResponse.json(
      { error: "Send a non-empty question." },
      { status: 400 },
    );
  }

  try {
    const reply = await askAssistant(history);
    return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AssistantNotConfiguredError) {
      // A missing key is a setup step, not a server fault — say so kindly and
      // don't leak which variable or where it lives.
      return NextResponse.json(
        {
          error:
            "The assistant isn't switched on yet. Add your Claude API key in the app's settings on Vercel, then try again.",
        },
        { status: 503 },
      );
    }
    console.error("[assistant]", error);
    return NextResponse.json(
      { error: "The assistant couldn't answer just now. Try again in a moment." },
      { status: 502 },
    );
  }
}
