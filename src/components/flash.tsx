import { Confetti } from "./confetti";

// Banner shown after an action sends you back to a parent page (?done=...).
const MESSAGES: Record<string, { text: string; party?: boolean }> = {
  "handed-in": { text: "🎉 Homework handed in. Well done!", party: true },
  created: { text: "✨ Homework created. Now fill in the three sections below (Quiz, Short answer, Task), then click Done." },
  saved: { text: "✅ Homework saved." },
  deleted: { text: "🗑️ Homework deleted." },
  "marks-saved": { text: "💾 Marks saved. Not shown to the child yet." },
  released: { text: "🚀 Marks released to the child.", party: true },
  hidden: { text: "🙈 Result hidden from the child again." },
};

export function Flash({ done }: { done?: string | string[] }) {
  const key = Array.isArray(done) ? done[0] : done;
  const message = key ? MESSAGES[key] : undefined;
  if (!message) return null;
  return (
    <>
      {message.party && <Confetti />}
      <p
        role="status"
        className="animate-slide-down rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
      >
        {message.text}
      </p>
    </>
  );
}
