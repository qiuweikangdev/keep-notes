# Repository Guidelines

## Project Structure & Module Organization

This is an Electron + Vite + React TypeScript desktop app. Main-process code lives in `src/main`, with IPC handlers under `src/main/ipc` and shortcuts under `src/main/shortcuts`. Preload bridge APIs live in `src/preload` and should expose renderer-safe wrappers only. Shared types and constants belong in `src/shared`. Renderer code is in `src/renderer/src`, organized by `app`, `components`, `features`, `hooks`, `lib`, `pages`, `store`, `styles`, and `types`. App icons and packaging assets are in `build`, `resources`, and `images`. Generated output goes to `out`.

## Build, Test, and Development Commands

Use `pnpm` for dependency management because the repository includes `pnpm-lock.yaml`.

Dependency installation policy:

- Reuse the existing local `node_modules` whenever it is present and complete.
- Do not run `pnpm install`, `npm install`, `yarn install`, or equivalent dependency installation commands for ordinary code changes.
- Do not delete, move, prune, or recreate `node_modules` unless the user explicitly asks for it.
- Do not regenerate or modify `pnpm-lock.yaml` unless `package.json` dependency declarations intentionally change.
- If a command fails because dependencies are missing or broken, stop and explain the issue before installing anything. Ask the user for approval unless the user has already requested dependency installation.
- Prefer running project scripts directly with the existing installation, such as `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

- `pnpm dev`: run the Electron app with `electron-vite dev` and `nodemon`.
- `pnpm start`: preview the built app with `electron-vite preview`.
- `pnpm build`: run TypeScript checks, then build the app.
- `pnpm typecheck`: run all TypeScript checks.
- `pnpm typecheck:node` / `pnpm typecheck:web`: check Node-side or renderer-side configs.
- `pnpm lint`: lint the repository with Oxlint.
- `pnpm lint:fix`: apply Oxlint fixes.
- `pnpm format`: format the repository with Oxfmt.
- `pnpm build:win`, `pnpm build:mac`, `pnpm build:linux`: create platform packages with `electron-builder`.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, final newline, trimmed trailing whitespace, and 2-space indentation. Use TypeScript for app code and TSX for React components. Prefer kebab-case filenames such as `file-tree.tsx`, `use-keyboard-shortcuts.ts`, and `settings-modal.tsx`. Keep feature UI in `src/renderer/src/features/<feature>/components`; put reusable primitives in `src/renderer/src/components/ui`. Oxlint warns on `any` and unused variables; prefix intentionally unused parameters with `_`.

## Testing Guidelines

There is no dedicated test script or first-party test folder. Before submitting changes, run `pnpm typecheck`, `pnpm lint`, and `pnpm build`. When adding tests, colocate them near the code they cover or create `src/**/__tests__`, using names like `tree.store.test.ts` or `editor.test.tsx`.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, sometimes with Conventional Commit prefixes, for example `fix editor slash menu interactions` and `feat: unify right-click menu for files and folders`. Keep commits focused and use `pnpm commit` for the configured Commitizen flow. Pull requests should include a concise summary, verification commands, linked issues when applicable, and screenshots or recordings for renderer UI changes.

All commit messages must be written in English.

## Security & Configuration Tips

Keep filesystem and Git operations in the main process, then expose narrow APIs through `src/preload/api`. Do not pass raw Node capabilities into renderer code. Keep packaging configuration in `electron-builder.yml` and Vite behavior in `electron.vite.config.ts`.

## Code Comments

Write Chinese comments for core method logic to improve team collaboration and code maintainability.

## Code Formatting

Use the project's Oxc configuration for linting and formatting. Run `pnpm lint` to check code, `pnpm lint:fix` to auto-fix lint issues, and `pnpm format` to apply Oxfmt formatting.

## Working Principles

### Understand First, Act Later

Before making any changes, thoroughly understand the codebase, requirements, and context. Analyze existing patterns and conventions before implementing solutions.

### Minimal Change Principle

All modifications should maintain the smallest possible impact scope:

- Do not introduce refactoring unrelated to the task
- Do not modify unrelated files
- Do not change unrelated behavior
- Do not arbitrarily adjust formatting, naming, or directory structure
- Do not delete code that appears unused without confirming its purpose

### Verification Phase

After completing modifications, execute necessary verification based on project requirements:

- Run `pnpm typecheck` to verify TypeScript correctness
- Run `pnpm lint` to verify code style compliance
- Run `pnpm build` to verify build success

### Sensitive Information

Do not leak, print, commit, or fabricate the following:

- API Keys
- Tokens
- Cookies
- Passwords
- Private keys
- User privacy data
- Internal service addresses
- Production database connection information
- Access credentials

## Response Guidelines

After completing a task, explain:

- What was modified
- Why it was changed this way
- Which files were involved

## Language

Respond in Chinese.

## Superpowers Workflow

When using the superpowers workflow skill (e.g., `using-superpowers`, `writing-plans`, `executing-plans`), all generated output documents must be written in English.
