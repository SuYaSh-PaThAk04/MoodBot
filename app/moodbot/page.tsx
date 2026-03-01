"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type Role = "bot" | "user";
type Stage =
  | "name"
  | "mood"
  | "activity"
  | "waiting_feedback"
  | "post_activity"
  | "done";

interface Message {
  id: number;
  role: Role;
  html: string;
}

interface MoodOption {
  key: string;
  emoji: string;
  label: string;
  hoverBorder: string;
}

const MOODS: MoodOption[] = [
  { key: "happy",   emoji: "😊", label: "Happy",   hoverBorder: "hover:border-yellow-400" },
  { key: "sad",     emoji: "😢", label: "Sad",     hoverBorder: "hover:border-blue-400"   },
  { key: "anxious", emoji: "😰", label: "Anxious", hoverBorder: "hover:border-orange-400" },
  { key: "angry",   emoji: "😤", label: "Angry",   hoverBorder: "hover:border-red-400"    },
  { key: "excited", emoji: "🤩", label: "Excited", hoverBorder: "hover:border-teal-400"   },
  { key: "neutral", emoji: "😐", label: "Neutral", hoverBorder: "hover:border-gray-400"   },
];

const SAD_MOODS = ["sad", "anxious", "angry"];
const STAGE_ORDER: Stage[] = ["name", "mood", "activity", "waiting_feedback", "post_activity"];

// ── Helpers ────────────────────────────────────────────────────────────────
let msgId = 0;
function makeMsg(role: Role, html: string): Message {
  return { id: ++msgId, role, html };
}

function formatText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong class='text-teal-300 font-semibold'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em class='text-pink-400 not-italic font-medium'>$1</em>")
    .replace(/^- (.+)$/gm, "<li class='ml-4 mb-1 list-disc'>$1</li>")
    .replace(/(<li[\s\S]*<\/li>)/, "<ul class='mt-2'>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

// ── API Call ───────────────────────────────────────────────────────────────
async function gemini(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userMessage }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text as string;
}

// ── Prompts ────────────────────────────────────────────────────────────────
const greetPrompt = (name: string) =>
  `You are MoodBot, a warm wellness companion. The user's name is ${name}.
Greet them warmly using their name, ask how they're feeling today.
Keep it 2-3 sentences, friendly, supportive. End with "Pick your mood below!"
Don't list moods yourself.`;

const activityPrompt = (name: string, mood: string) =>
  `You are MoodBot. User's name: ${name}. They feel: ${mood}.
Acknowledge their mood with empathy. Suggest ONE specific actionable activity.
- One empathetic sentence about their mood
- "Here's something I'd love for you to try:"
- Activity name in **bold**
- 2-3 sentences: what to do, how long, why it helps
- Encouraging closing line
${SAD_MOODS.includes(mood) ? "Be extra gentle and nurturing." : "Be upbeat and enthusiastic!"}
Under 120 words.`;

const altActivityPrompt = (name: string, mood: string) =>
  `You are MoodBot. User ${name} feels ${mood} and wants a DIFFERENT activity.
Suggest something fresh and creative. Same format. Under 100 words. Be enthusiastic!`;

const postActivityPrompt = (name: string, mood: string, feedback: string) =>
  `You are MoodBot. User is ${name}, was feeling ${mood}, just completed an activity.
Their feedback: "${feedback}"
1. Celebrate their effort warmly
2. ${SAD_MOODS.includes(mood)
    ? "Suggest 2-3 things they can do over the next few days to keep improving their mood. Be specific and practical."
    : "Give quick positive reinforcement."}
3. Warm closing encouraging them to return anytime.
Uplifting, warm, personal. Use their name once. Under 160 words.`;

// ── Fallback Activities ────────────────────────────────────────────────────
function getFallbackActivity(mood: string, name: string): string {
  const map: Record<string, string> = {
    happy:   `Love your energy, ${name}! 🌟 Try **Gratitude Journaling** — spend 10 minutes writing 5 things you're grateful for and why. It reinforces positivity and makes good feelings last longer. Ready to try it?`,
    sad:     `I hear you, ${name}, and it's okay to feel sad. 💙 Try **Gentle Body Scan Meditation** — find a quiet spot, lie down, and spend 15 minutes slowly breathing and noticing each part of your body.`,
    anxious: `Anxiety can feel overwhelming, ${name}. 🌬️ Try **Box Breathing**: inhale 4 counts, hold 4, exhale 4, hold 4. Repeat 8 times. It activates your parasympathetic nervous system and calms anxiety fast.`,
    angry:   `Your feelings are valid, ${name}. 🌊 Try **Physical Release** — do 20 jumping jacks then 5 minutes of stretching. Movement channels adrenaline constructively and resets your nervous system.`,
    excited: `Love that excitement, ${name}! ⚡ Channel it into **Creative Expression** — grab any art supplies and create something for 20 minutes. No rules, just expression!`,
    neutral: `Let's add some spark, ${name}! 🌿 Try a **Mindful Walk** — 15 minutes outside, consciously noticing 5 things you see, 4 you can touch, 3 you hear.`,
  };
  return formatText(map[mood] ?? map.neutral);
}

// ── Component ──────────────────────────────────────────────────────────────
export default function MoodBotPage() {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [stage, setStage]                 = useState<Stage>("name");
  const [loading, setLoading]             = useState(false);
  const [inputVal, setInputVal]           = useState("");
  const [userName, setUserName]           = useState("");
  const [userMood, setUserMood]           = useState("");
  const [showMoodBoard, setShowMoodBoard] = useState(false);
  const [chips, setChips]                 = useState<{ value: string; label: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addBotMsg  = useCallback((html: string) => setMessages(p => [...p, makeMsg("bot",  html)]), []);
  const addUserMsg = useCallback((html: string) => setMessages(p => [...p, makeMsg("user", html)]), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Init greeting
  useEffect(() => {
    setTimeout(() => addBotMsg(
      `Hey there! 👋 I'm <strong class='text-teal-300 font-semibold'>MoodBot</strong>, your personal wellness companion.<br/><br/>` +
      `I'm here to understand how you're feeling and suggest activities to help you feel your best. 🌟<br/><br/>` +
      `Let's start — <em class='text-pink-400 not-italic font-medium'>what's your name?</em>`
    ), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageIndex = STAGE_ORDER.indexOf(stage);

  // ── Stage Handlers ────────────────────────────────────────────────────────
  async function handleNameStage(name: string) {
    const firstName = name.trim().split(" ")[0];
    setUserName(firstName);
    setLoading(true);
    setChips([]);
    try {
      const reply = await gemini(greetPrompt(firstName), `My name is ${firstName}`);
      addBotMsg(formatText(reply));
    } catch {
      addBotMsg(`Lovely to meet you, <strong class='text-teal-300 font-semibold'>${firstName}</strong>! 🌸 How are you feeling today? Pick your mood below!`);
    }
    setStage("mood");
    setShowMoodBoard(true);
    setLoading(false);
  }

  async function handleMoodSelect(mood: MoodOption) {
    setShowMoodBoard(false);
    addUserMsg(`${mood.emoji} ${mood.label}`);
    setUserMood(mood.key);
    setLoading(true);
    setChips([]);
    try {
      const reply = await gemini(activityPrompt(userName, mood.key), `I'm feeling ${mood.key}`);
      addBotMsg(formatText(reply));
    } catch {
      addBotMsg(getFallbackActivity(mood.key, userName));
    }
    setStage("activity");
    setChips([
      { value: "done_activity",      label: "✅ Done! How did it go?" },
      { value: "different_activity", label: "🔄 Suggest something else" },
    ]);
    setLoading(false);
  }

  async function handleAlternativeActivity() {
    setLoading(true);
    setChips([]);
    try {
      const reply = await gemini(altActivityPrompt(userName, userMood), "Suggest a different activity");
      addBotMsg(formatText(reply));
    } catch {
      addBotMsg("Let me think of something else! Try a 10-minute walk outside — fresh air works wonders. 🌿");
    }
    setChips([
      { value: "done_activity",      label: "✅ Done! How did it go?" },
      { value: "different_activity", label: "🔄 One more option" },
    ]);
    setLoading(false);
  }

  async function handlePostActivity(feedback: string) {
    setLoading(true);
    setChips([]);
    try {
      const reply = await gemini(postActivityPrompt(userName, userMood, feedback), feedback);
      addBotMsg(formatText(reply));
    } catch {
      addBotMsg(`That's wonderful, <strong class='text-teal-300 font-semibold'>${userName}</strong>! 🌟 Small acts of self-care add up to big changes. Come back anytime! 💙`);
    }
    setStage("done");
    setChips([{ value: "restart", label: "🔄 Check in again" }]);
    setLoading(false);
  }

  async function handleChip(value: string, label: string) {
    setChips([]);
    if (value === "restart")            { restartChat(); return; }
    if (value === "different_activity") { addUserMsg(label); await handleAlternativeActivity(); return; }
    if (value === "done_activity") {
      addUserMsg(label);
      addBotMsg(`Amazing, <strong class='text-teal-300 font-semibold'>${userName}</strong>! 🎉 How did you feel during or after the activity? Share any thoughts!`);
      setStage("waiting_feedback");
    }
  }

  async function sendMessage() {
    const text = inputVal.trim();
    if (!text || loading) return;
    setInputVal("");
    addUserMsg(text);
    setChips([]);
    setShowMoodBoard(false);
    if (stage === "name")               await handleNameStage(text);
    else if (stage === "waiting_feedback") await handlePostActivity(text);
  }

  function restartChat() {
    setMessages([]);
    setStage("name");
    setUserName("");
    setUserMood("");
    setShowMoodBoard(false);
    setChips([]);
    setTimeout(() => addBotMsg(
      `Welcome back! 🌙 I'm always here for you.<br/><br/><em class='text-pink-400 not-italic font-medium'>What's your name?</em>`
    ), 300);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-[#e8e8f0] overflow-x-hidden flex flex-col items-center">

      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-24 -left-32 w-[500px] h-[400px] rounded-full bg-violet-600/[0.07] blur-[80px]" />
        <div className="absolute -bottom-24 -right-24 w-[400px] h-[400px] rounded-full bg-pink-500/[0.06] blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-teal-400/[0.04] blur-[80px]" />
      </div>

      <div className="relative z-10 w-full max-w-3xl px-5 flex flex-col flex-1">

        {/* ── Header ── */}
        <header className="flex items-center gap-3 pt-6">
          <div className="w-11 h-11 rounded-[14px] bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-xl shadow-[0_0_24px_rgba(124,106,255,0.35)] shrink-0">
            🌙
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-teal-400 bg-clip-text text-transparent" style={{ fontFamily: "'Syne', sans-serif" }}>
              MoodBot
            </h1>
            <p className="text-xs text-[#888899] mt-0.5">Your personal wellness companion</p>
          </div>

          {/* Stage progress dots */}
          <div className="ml-auto flex items-center gap-1.5">
            {STAGE_ORDER.map((s, i) => (
              <div
                key={s}
                className={`h-[7px] rounded-full transition-all duration-500 ${
                  i < stageIndex
                    ? "w-[7px] bg-teal-400"
                    : i === stageIndex
                    ? "w-5 bg-violet-500 shadow-[0_0_8px_rgba(124,106,255,0.7)] rounded-[4px]"
                    : "w-[7px] bg-[#2a2a3d]"
                }`}
              />
            ))}
          </div>
        </header>

        {/* ── Messages ── */}
        <main className="flex-1 flex flex-col">
          <div className="flex flex-col gap-4 py-6 overflow-y-auto min-h-[calc(100vh-260px)] max-h-[calc(100vh-260px)]"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a3d transparent" }}>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                style={{ animation: "fadeUp 0.35s ease" }}
              >
                {/* Avatar */}
                <div className={`w-[34px] h-[34px] rounded-xl flex items-center justify-center text-base shrink-0 ${
                  msg.role === "bot"
                    ? "bg-gradient-to-br from-violet-500 to-pink-500 shadow-[0_0_12px_rgba(124,106,255,0.3)]"
                    : "bg-[#1c1c28] border border-[#2a2a3d]"
                }`}>
                  {msg.role === "bot" ? "🌙" : "👤"}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[72%] px-4 py-3 text-sm leading-relaxed rounded-[18px] ${
                    msg.role === "bot"
                      ? "bg-[#161622] border border-[#2a2a3d] rounded-tl-[4px]"
                      : "bg-[#1e1e35] border border-violet-500/20 rounded-tr-[4px]"
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.html }}
                />
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-3" style={{ animation: "fadeUp 0.35s ease" }}>
                <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-base shrink-0 shadow-[0_0_12px_rgba(124,106,255,0.3)]">
                  🌙
                </div>
                <div className="flex items-center gap-1.5 bg-[#161622] border border-[#2a2a3d] rounded-[18px] rounded-tl-[4px] px-5 py-4">
                  {[0, 200, 400].map((delay) => (
                    <span
                      key={delay}
                      className="w-[7px] h-[7px] rounded-full bg-violet-500 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Mood Board ── */}
          {showMoodBoard && !loading && (
            <div className="pb-2" style={{ animation: "fadeUp 0.4s ease" }}>
              <p className="text-[11px] uppercase tracking-widest text-[#888899] mb-2.5">
                How are you feeling?
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {MOODS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => handleMoodSelect(m)}
                    className={`bg-[#13131a] border border-[#2a2a3d] rounded-2xl py-4 px-3 flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${m.hoverBorder}`}
                  >
                    <span className="text-3xl leading-none">{m.emoji}</span>
                    <span className="text-xs text-[#888899] font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Chips ── */}
          {chips.length > 0 && !loading && (
            <div className="flex flex-wrap gap-2 pb-2" style={{ animation: "fadeUp 0.4s ease" }}>
              {chips.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleChip(c.value, c.label)}
                  className="bg-[#13131a] border border-[#2a2a3d] rounded-full px-4 py-2 text-sm text-[#e8e8f0] cursor-pointer transition-all duration-200 hover:border-violet-500 hover:bg-violet-500/10 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(124,106,255,0.15)]"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </main>

        {/* ── Input Area ── */}
        <div className="flex gap-2.5 items-end py-4 pb-6">
          <div className="flex-1 bg-[#13131a] border border-[#2a2a3d] rounded-2xl flex items-center pl-4 pr-1 py-1 focus-within:border-violet-500 transition-colors duration-200">
            <textarea
              className="flex-1 bg-transparent border-none outline-none text-[#e8e8f0] text-sm py-2.5 resize-none leading-relaxed max-h-[120px] placeholder:text-[#888899]"
              value={inputVal}
              placeholder="Type a message…"
              rows={1}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={loading || !inputVal.trim()}
            aria-label="Send"
            className="w-[42px] h-[42px] rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_16px_rgba(124,106,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

      </div>

      {/* Keyframe + Syne font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}