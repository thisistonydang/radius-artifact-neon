# Radius artifact with a Neon backend

[![CI](https://github.com/thisistonydang/radius-artifact-neon/actions/workflows/ci.yml/badge.svg)](https://github.com/thisistonydang/radius-artifact-neon/actions/workflows/ci.yml)

A small example showing that a [Radius artifact](https://radius.earendil.com/) can use [Neon](https://neon.com/) as a complete backend.

This app is a full-stack todo list that combines Neon Functions, Lakebase Postgres, Object Storage, Neon Auth, and AI Gateway. Together, these services provide a local-first guest experience, account-based cloud sync, file attachments, and AI questions about the current list. Visitors can add, edit, complete, and delete todos without an account because guest changes stay in localStorage; Neon Auth is needed only for cloud sync and uploads.

**Live demo:** https://01m2bw7sqme6tr4s569h0wvnsz.trove.sh/

## Architecture

```mermaid
flowchart LR
  Browser[Radius artifact\nSvelte frontend] --> Local[Browser localStorage\nguest todos]
  Browser --> Function[Neon Function\nHono API]
  Function --> Postgres[Lakebase Postgres\nstarter and saved todos]
  Function --> Storage[Neon Object Storage\nfile attachments]
  Function --> Gateway[Neon AI Gateway\ntodo questions]
  Browser --> Auth[Neon Auth\noptional sign-in]
  Auth --> Function
```

| Capability | Purpose |
| --- | --- |
| Radius artifact | Hosts the compiled HTML, CSS, and JavaScript |
| Browser `localStorage` | Saves guest changes on one device |
| Lakebase Postgres | Stores the todos, rate limits, and cleanup queue |
| Neon Object Storage | Stores the four example files and account attachments |
| Neon Function | Provides the API and keeps credentials server-side |
| Neon Auth | Protects account syncing and uploads |
| Neon AI Gateway | Answers questions about the current list |

The frontend contains only public service URLs. Database, storage, and AI credentials stay inside the Neon Function.

## Stack

- Svelte and Vite with a build-time prerendered page shell
- Hono
- Drizzle ORM and `pg`
- Neon Functions, Auth, Object Storage, AI Gateway, and Lakebase Postgres
- Vercel AI SDK with the Neon provider

## Requirements

- Node.js 20.19 or newer
- pnpm 10
- A Neon account and current `neon` CLI
- A Neon project in `aws-us-east-2` or `aws-eu-central-1`
- A paid Neon plan for AI Gateway access
- Radius access for publishing the frontend artifact

Neon Functions, Object Storage, and AI Gateway are beta services. Check the current [Neon backend beta guide](https://neon.com/docs/get-started/backend-beta) before using this example for production work.

## Project structure

```text
functions/api.ts                       Hono API deployed as a Neon Function
src/                                   Svelte frontend and database schema
src/lib/AnimatedLogo.svelte            Replayable Radius and Neon logo animation
seed/todos.ts                          Four funny starter todos and four example files
scripts/seed.ts                        Postgres and Object Storage seed script
scripts/prerender.ts                   Renders the static page shell and loading skeleton
scripts/write-runtime-config.ts        Creates public dist/config.json
neon.ts                                Branch-aware Neon backend definition
drizzle/                               SQL migrations
public/config.json                     Local frontend runtime defaults
public/mixkit-arcade-bonus-229.wav     Logo underline sound effect
```

## Set up Neon

Install dependencies and authenticate:

```bash
pnpm install
neon auth
```

Link a project in a supported region, create a development branch if needed, then check it out:

```bash
neon link
neon branch create --name dev
neon checkout dev --no-env-pull
```

Skip `neon branch create` when `dev` already exists.

Create a gitignored `.env.local`, generate a random salt, and replace the placeholder `RATE_LIMIT_SALT` value:

```bash
cp .env.example .env.local
openssl rand -hex 32
```

Paste the generated value into `RATE_LIMIT_SALT` in `.env.local`.

Review and apply the backend:

```bash
neon config plan --env .env.local
neon deploy --env .env.local --update-existing
pnpm db:migrate
pnpm db:seed
```

Deployment provisions Neon Auth, the private `attachments` bucket, the `todos` Function, and AI Gateway access. It also pulls Neon-managed values into `.env.local`.

## Configure the frontend

Set these public values in `.env.local` after deployment:

```dotenv
PUBLIC_API_URL=https://your-function-url
PUBLIC_NEON_AUTH_URL=https://your-neon-auth-url
```

Use the Function URL reported by `neon deploy` and the value pulled as `NEON_AUTH_BASE_URL`. They are public endpoints, not credentials.

For local authentication, allow localhost:

```bash
neon neon-auth domain allow-localhost enable
```

Run the frontend and Function in separate terminals:

```bash
pnpm dev
neon dev --source ./functions/api.ts --port 8787
```

Open http://localhost:5173.

## How the app behaves

### Without an account

- Four starter todos load from Lakebase Postgres.
- Every starter todo has a small text or Markdown attachment in Object Storage.
- Changes are stored under `radius-neon-todos:v1` in the browser.
- Creating, editing, completing, deleting, and resetting todos require no account.
- The current list is sent to the Function only when the visitor asks an AI question.
- Public AI requests have per-address and global server-side limits.

### With an account

- Creating an account saves the current browser list to that account.
- Signing in to an existing account replaces the browser list with the account’s saved list.
- Signed-in changes save immediately through a serialized save queue with server-side revision checks.
- Signing out waits for pending changes, then restores the four starter todos in `localStorage`.
- Selecting **attach file** opens Neon Auth if needed.
- Each saved todo supports up to three PNG, JPEG, PDF, Markdown, or text attachments.
- Each attachment is limited to 5 MB, and each account is limited to 50 MB.
- Per-account, per-address, daily global upload, and 1 GB shared storage limits protect the public demo.

The artifact and Neon Auth are on different origins. Browsers that strictly block third-party cookies, especially Safari, may not preserve the optional sign-in session. The public todo experience does not use cookies and still works.

## API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Backend health |
| `GET` | `/api/starter-todos` | Public | Starter todos and example attachment metadata |
| `GET` | `/api/starter-attachments/:id/url` | Public | Create an example attachment download URL |
| `POST` | `/api/chat` | Public, rate limited | Ask about the supplied todo list |
| `GET` | `/api/me/todos` | Authenticated | Load an online list |
| `PUT` | `/api/me/todos` | Authenticated | Save an online list |
| `POST` | `/api/me/todos/:id/attachments` | Authenticated, rate limited | Upload and record an attachment |
| `GET` | `/api/me/attachments/:id/url` | Authenticated | Create a download URL |
| `DELETE` | `/api/me/attachments/:id` | Authenticated | Queue attachment deletion |

## Production release

Do not point a public artifact at a shared development branch. Use a protected production branch with its own Function, Auth configuration, storage, and database state. Then:

1. Apply migrations and seed data to the production branch.
2. Deploy `neon.ts` with a production `.env` file and a unique `RATE_LIMIT_SALT`.
3. Build with the production Function and Auth URLs.
4. Add the Radius artifact origin to `APP_ORIGINS`.
5. Add the artifact origin to Neon Auth trusted domains.
6. Run the full CI checks before publishing.

```bash
neon neon-auth domain add https://your-radius-artifact-origin
```

## Build the Radius artifact

```bash
pnpm check
pnpm test
pnpm build
pnpm audit --prod
```

The build prerenders the static introduction and a four-row todo skeleton into `dist/index.html`, then hydrates it in the browser. Publish the contents of `dist/` as one Radius artifact. Keep publishing revisions to the same artifact when you want its URL and browser `localStorage` to remain stable.

## Useful commands

```bash
pnpm check          # Type-check Svelte, scripts, and Function code
pnpm test           # Run unit tests
pnpm build          # Build dist/ and write runtime config
pnpm db:migrate     # Apply SQL migrations using the direct database URL
pnpm db:seed        # Seed four todos and four attachments
pnpm neon:deploy    # Deploy neon.ts using .env.local
```

## Design

The interface is inspired by [pi.dev](https://pi.dev/): serif copy, monospace controls, thin borders, technical grid paper, square panels, bracket buttons, and dark and light themes. It does not copy the Pi site code or proprietary font files.

The hero uses the Radius and Neon marks in a Tetris-inspired assembly animation. Selecting **click to replay** runs it again. The cursor and replay control remain inactive until the animation finishes. A sound cue starts with the underline; browsers may block it during the automatic first run, but it works after the visitor selects replay. Reduced-motion mode shows the completed lockup without animation or sound.

## Third-party assets

The Radius and Neon names and marks belong to their respective owners and are not covered by this repository's MIT license. The logo sound is `mixkit-arcade-bonus-229.wav` from [Mixkit](https://mixkit.co/) and is used under the [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree).

## Security

Report security issues privately as described in [SECURITY.md](SECURITY.md). Do not run destructive or high-volume tests against the live demo.

## License

MIT.
