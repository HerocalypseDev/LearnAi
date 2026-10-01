// Green confirmation banner shown after an action sends you back to a parent page (?done=...).
const MESSAGES: Record<string, string> = {
  "handed-in": "🎉 Homework handed in. Well done!",
  created: "Homework created. Now add the quiz questions below, then click Done.",
  saved: "Homework saved.",
  deleted: "Homework deleted.",
  "marks-saved": "Marks saved. Not shown to the child yet.",
  released: "Marks released to the child.",
  hidden: "Result hidden from the child again.",
};

export function Flash({ done }: { done?: string | string[] }) {
  const key = Array.isArray(done) ? done[0] : done;
  const message = key ? MESSAGES[key] : undefined;
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
      {message}
    </p>
  );
}
