// Small user-agent reader for the activity log. Not exhaustive, just enough
// to tell the kids' phone and laptops apart.

export function describeDevice(ua: string): string {
  if (/Jarvis/i.test(ua)) return "Jarvis assistant";
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /CrOS/.test(ua) ? "Chromebook"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown";
  const kind =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet"
    : /Mobi|iPhone|Android/.test(ua) ? "phone"
    : "computer";
  return `${os} ${kind}`;
}

export function describeBrowser(ua: string): string {
  const match = (re: RegExp) => ua.match(re)?.[1]?.split(".")[0];
  let v: string | undefined;
  if ((v = match(/Jarvis[^/]*\/([\d.]+)/i))) return `Jarvis ${v}`;
  if ((v = match(/Edg(?:A|iOS)?\/([\d.]+)/))) return `Edge ${v}`;
  if ((v = match(/OPR\/([\d.]+)/))) return `Opera ${v}`;
  if ((v = match(/SamsungBrowser\/([\d.]+)/))) return `Samsung Internet ${v}`;
  if ((v = match(/(?:Firefox|FxiOS)\/([\d.]+)/))) return `Firefox ${v}`;
  if ((v = match(/(?:Chrome|CriOS)\/([\d.]+)/))) return `Chrome ${v}`;
  if ((v = match(/Version\/([\d.]+).*Safari/))) return `Safari ${v}`;
  return "Unknown browser";
}
