# Ledger React app

The replacement app lives in this directory. Run these commands from the repository root with Node.js 22.12+ or 24+.

```sh
npm ci --prefix app
npm run dev --prefix app
npm run build --prefix app
npm run preview --prefix app
```

The shell includes responsive navigation, shared surface and typography tokens, and a System, Light, or Dark preference saved on this device. Hash navigation supports direct links and browser back without a host rewrite. The static build is written to `app/dist`.

Workflow implementation, owner sign-in, and cloud data access are tracked in GitHub. The existing Netlify project serves the root prototype until the replacement is ready and the deployment changes in #9.
