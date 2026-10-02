import { TIME_ZONE } from "./time";

// Class dates. Lessons are on Sundays; edit this list if the schedule changes.
export const CLASS_SUNDAYS = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];

export interface CourseWeek {
  week: number;
  /** Class day, e.g. "2026-10-04". Keep in step with CLASS_SUNDAYS. */
  date: string;
  topic: string;
  learn: string;
  doThis: string;
  /** Words from the student handbook that come up in this week's class and quiz. */
  terms: { word: string; meaning: string }[];
}

// The month's outline, from the Student Handbook ("Weekly plan" and "Key terms").
export const COURSE_OUTLINE: CourseWeek[] = [
  {
    week: 1,
    date: CLASS_SUNDAYS[0],
    topic: "What is AI?",
    learn: "What AI is, how a computer learns from examples, the 4 steps of how AI learns, and five big moments in AI history.",
    doThis: "Find the AI in apps you use; test what Claude is good and bad at.",
    terms: [
      { word: "AI (artificial intelligence)", meaning: "A computer that can do things that usually need a human brain, like understanding words or recognising faces." },
      { word: "Machine learning", meaning: "When a computer learns from lots of examples instead of only following rules a person wrote." },
      { word: "Data", meaning: "The examples an AI learns from." },
      { word: "Training", meaning: "When the AI studies the examples and finds patterns." },
      { word: "Model", meaning: "What the AI knows after training." },
      { word: "Prediction", meaning: "The AI's best guess about something new." },
      { word: "Narrow AI", meaning: "AI that is good at one kind of job. All AI today is narrow." },
    ],
  },
  {
    week: 2,
    date: CLASS_SUNDAYS[1],
    topic: "How chatbots work",
    learn: "How ChatGPT and Claude guess the next word, why they sometimes get things wrong, and how AI makes pictures.",
    doThis: "Learn the 4 parts of a good prompt and test weak vs strong prompts on Claude.",
    terms: [
      { word: "LLM (large language model)", meaning: "The type of AI behind chatbots like ChatGPT and Claude." },
      { word: "Token", meaning: "A small piece of a word or sentence that a chatbot reads and writes." },
      { word: "Hallucination", meaning: "When AI says something false but sounds very sure." },
      { word: "Prompt", meaning: "What you type to an AI." },
      { word: "Role, Task, Context, Format", meaning: "The 4 parts of a good prompt: who the AI acts as, what to do, who it's for, how the answer should look." },
    ],
  },
  {
    week: 3,
    date: CLASS_SUNDAYS[2],
    topic: "Checking AI and staying safe",
    learn: "How to check facts, what deepfakes are, what never to type into AI, and how to use AI honestly.",
    doThis: "Test your prompts; check Claude's answers; choose your showcase topic.",
    terms: [
      { word: "Deepfake", meaning: "A fake video, picture or voice made with AI." },
      { word: "Bias", meaning: "When AI is unfair because it learned from unfair or one-sided examples." },
    ],
  },
  {
    week: 4,
    date: CLASS_SUNDAYS[3],
    topic: "Code and showcase",
    learn: "What code is, how to write a simple Python program, how AI writes code, and jobs in AI.",
    doThis: "Build your own simple chatbot in Python; present to your parents.",
    terms: [
      { word: "Code", meaning: "Exact instructions for a computer." },
      { word: "Algorithm", meaning: "A list of steps to solve a problem." },
      { word: "Variable", meaning: "A labelled box in a program that stores information." },
      { word: "If / else", meaning: "Code that makes a decision: if something is true, do one thing; otherwise, do another." },
      { word: "Bug", meaning: "A mistake in code." },
    ],
  },
];

/** Today's date in Lagos as "YYYY-MM-DD". */
export function lagosToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/**
 * Index of the class week we are in: the latest class day that is today or earlier.
 * -1 before the first class. After the last class it stays on the last week.
 */
export function currentWeekIndex(today: string, sundays: readonly string[] = CLASS_SUNDAYS): number {
  let index = -1;
  sundays.forEach((day, i) => {
    if (day <= today) index = i;
  });
  return index;
}
