// Safe localStorage helpers for draft text in client components. Storage can be full, switched off or
// blocked (private browsing), so every call swallows errors: a draft is a convenience, never required.

export function saveLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota / disabled storage.
  }
}

export function loadLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore disabled storage.
  }
}
