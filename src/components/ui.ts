// Shared Tailwind class strings so forms and buttons look and feel the same everywhere.
// Buttons lift on hover, press in on click and glow when focused with the keyboard.
const pressable =
  "inline-flex items-center justify-center gap-2 transition duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-60 select-none";

export const inputClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 hover:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500";
export const buttonClass = `${pressable} rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 focus-visible:ring-indigo-300`;
const secondaryLook = "rounded-xl bg-white text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 hover:shadow-md hover:ring-slate-400 focus-visible:ring-slate-300";
export const smallSecondaryButtonClass = `${pressable} px-3 py-1.5 ${secondaryLook}`;
export const secondaryButtonClass = `${pressable} rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 hover:shadow-md hover:ring-slate-400 focus-visible:ring-slate-300`;
export const dangerButtonClass = `${pressable} rounded-xl bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50 hover:shadow-md hover:ring-red-300 focus-visible:ring-red-200`;
const big = "w-full rounded-2xl px-4 py-3.5 text-lg font-bold text-white shadow-lg hover:shadow-xl";
export const bigGoButtonClass = `${pressable} ${big} bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/30 hover:shadow-emerald-500/40 focus-visible:ring-emerald-300`;
export const bigPrimaryButtonClass = `${pressable} ${big} bg-gradient-to-r from-indigo-600 to-violet-600 shadow-indigo-500/30 hover:shadow-indigo-500/40 focus-visible:ring-indigo-300`;
export const cardClass = "rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-200 backdrop-blur-sm";
/** Cards that are links: lift and glow on hover. */
export const linkCardClass =
  "group block rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-200 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10 hover:ring-indigo-300 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200";
