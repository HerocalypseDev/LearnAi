# Plan: Fix Task Editor Bugs

## Context
The recently added task editor has critical issues that need fixing. The component incorrectly uses hooks in a server-side context, lacks key state management, and has buggy text list handling.

## Proposed Changes
1.  **Fix React Server Component Error**: The `page.tsx` must be `use client` or the `TextEditor` needs to be imported as a client component correctly.
2.  **State Management**: Fix `TextEditor` state, specifically `setProgress` and `progress`.
3.  **List Logic**: Correct the list item detection and insertion logic in `lib/task-text.ts` and `text-editor.tsx`.
4.  **Stable Filenames**: Use `nextTextFileName` from `lib/task-text.ts` for file naming instead of `Date.now()`.
5.  **Refactor**: Cleanup `page.tsx` to handle client state properly.

## Critical Files
- `src/app/homework/[id]/page.tsx`
- `src/app/homework/[id]/text-editor.tsx`
- `src/lib/task-text.ts`

## Verification
- Run `npm run build` to catch server component errors.
- Manually test:
  - Opening/closing editor.
  - Writing text and saving drafts (localStorage).
  - Uploading text and verifying filename format.
  - Adding bullet points to ensure logic is correct.
