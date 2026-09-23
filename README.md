# Monzilla

A kaiju sanctuary game for a young kid: raise baby kaiju, build your island,
protect it from bad guys, and fill the collection book. iPad first, iPhone
second, computer as he grows.

Read [docs/DESIGN.md](docs/DESIGN.md) for the why. This file is the how.

## Run it

```sh
npm install
npm run dev
```

Open the printed URL on the iPad (same Wi‑Fi) or on the computer. Add it to
the home screen from Safari's share sheet to get a full-screen app.

Without Firebase configured the game saves to the browser on that device
only. That is fine for trying it out.

## Sync across devices (Firebase)

1. Create a Firebase project. Enable **Authentication → Google** and
   **Firestore**.
2. Add a Web app in project settings and copy its config into
   `apps/web/.env.local` (see `apps/web/.env.example`).
3. Deploy the rules: `npx firebase deploy --only firestore:rules`.
4. In the game, open ⚙️ and sign in with Google in the parent zone, once per
   device.

Firestore's offline cache keeps the game working with no signal and syncs
when it reconnects.

## Deploy

**GitHub Pages (automatic).** Every push to `main` runs
`.github/workflows/pages.yml`, which tests, builds, and publishes the app
to GitHub Pages. Add the four `VITE_FIREBASE_*` values as repository
secrets to ship a build with sync enabled; without them the Pages build
saves on-device only.

**Firebase Hosting (manual).**

```sh
npm run build
npx firebase deploy --only hosting
```

## Layout

- `packages/core` — all game rules and procedural generation. Pure
  TypeScript, deterministic, unit-tested. No rendering.
- `apps/web` — Phaser 3 rendering, Firebase, PWA shell.
- `firebase/` — Firestore security rules.

```sh
npm test         # core unit tests
npm run typecheck
```
