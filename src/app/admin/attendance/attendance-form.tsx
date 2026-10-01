"use client";

import { Spinner } from "@/components/spinner";
import { useActionState } from "react";
import { saveAttendance, type AttendanceState } from "@/app/actions/attendance";
import { buttonClass, inputClass } from "@/components/ui";

export interface AttendanceRow {
  studentId: string;
  name: string;
  present: boolean | null;
  note: string;
}

export function AttendanceForm({ date, label, rows }: { date: string; label: string; rows: AttendanceRow[] }) {
  const [state, action, pending] = useActionState<AttendanceState, FormData>(saveAttendance, {});

  return (
    <form action={action} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <input type="hidden" name="date" value={date} />
      <h2 className="font-semibold">{label}</h2>
      {rows.map((r) => (
        <div key={r.studentId} className="grid gap-2 sm:grid-cols-[6rem_auto_1fr] sm:items-center">
          <span className="font-medium">{r.name}</span>
          <div className="flex gap-1">
            {[
              { value: "yes", text: "Present" },
              { value: "no", text: "Absent" },
            ].map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input
                  type="radio"
                  name={`present_${r.studentId}`}
                  value={o.value}
                  defaultChecked={r.present === (o.value === "yes")}
                  className="peer sr-only"
                />
                <span
                  className={`inline-block cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium ring-1 ring-slate-300 transition hover:-translate-y-0.5 hover:shadow-md active:scale-95 peer-checked:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 ${
                    o.value === "yes" ? "peer-checked:bg-emerald-600" : "peer-checked:bg-red-600"
                  } peer-checked:text-white peer-checked:ring-transparent`}
                >
                  {o.text}
                </span>
              </label>
            ))}
          </div>
          <input name={`note_${r.studentId}`} defaultValue={r.note} placeholder="Note (optional)" className={inputClass} />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>
          {pending ? (<><Spinner /> Saving…</>) : "Save"}
        </button>
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
