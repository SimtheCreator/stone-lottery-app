# Stone Lottery App Deployment

## Architecture

- Frontend: Vite + React, deployed on Vercel.
- Database: Cloud Firestore project `mystic-lucky-draw`.
- Public realtime collections: `selections`, `participants`, `logs`, `round_archives`.
- Admin reset: Vercel serverless function at `/api/reset`, using Firebase Admin SDK.

## 1. Deploy Firestore Rules

Install/login to Firebase CLI, then run from this project folder:

```bash
firebase login
firebase use mystic-lucky-draw
firebase deploy --only firestore
```

The committed rules enforce:

- Anyone can read current board state and logs.
- A number can only be created once.
- A participant name key can only be created once.
- `selections/{number}` and `participants/{participantId}` must be created together in the same transaction.
- Clients cannot update/delete selected numbers.
- Clients cannot write round archives; reset archives are written by Admin SDK.

## 2. Prepare Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables for Production and Preview:

Use `.env.example` as the source checklist. Public `VITE_` values can come from Firebase web app config; `RESET_PASSWORD` and `FIREBASE_ADMIN_CONFIG` are server-side secrets.

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=mystic-lucky-draw.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mystic-lucky-draw
VITE_FIREBASE_STORAGE_BUCKET=mystic-lucky-draw.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=633487416451
VITE_FIREBASE_APP_ID=1:633487416451:web:b9abf051d93000cb760fb6
RESET_PASSWORD=<admin reset password>
FIREBASE_ADMIN_CONFIG=<one-line service account JSON>
```

`FIREBASE_ADMIN_CONFIG` must be the full service-account JSON compressed into one line. Do not commit it.

## 3. Deploy to Vercel

Vercel should auto-detect Vite.

Expected settings:

```text
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Deploy via Git integration or CLI:

```bash
vercel
vercel --prod
```

## 4. Production Smoke Test

After deploy:

1. Open the production URL in two browsers or devices.
2. Enter two different names.
3. Try selecting the same number at nearly the same time.
4. Expected: only one user wins the number.
5. Open Admin Dashboard.
6. Test reset only after confirming `RESET_PASSWORD` and `FIREBASE_ADMIN_CONFIG` are configured.
7. Confirm the old round appears in `round_archives` after reset.

## 5. If Saving Still Fails

Check in this order:

1. Firestore rules were deployed to the correct project: `mystic-lucky-draw`.
2. Browser console error code:
   - `permission-denied`: rules mismatch or wrong project.
   - network errors: deployment/domain issue.
3. Firestore has these collections available after first use:
   - `selections`
   - `participants`
   - `logs`
   - `round_archives`
4. Vercel env vars were added to the same environment you deployed.
