# Deploying to Render

The repository root holds `render.yaml`, a Render Blueprint that sets up the web service from this folder:

| Part | What it does |
| --- | --- |
| Build | `pip install -r requirements.txt && python scripts/fetch_data.py`. The script downloads the NASA JPL ephemeris (checked against a pinned SHA-256) and the GeoNames place data, then builds the place index. These files are too large for git. |
| Start | `uvicorn server.app:app` with one worker, behind Render's HTTPS proxy. |
| Disk | 1 GB mounted at `/var/data` for the two SQLite databases (accounts and orders, saved readings). |
| Plan | Starter. A disk needs a paid instance; on the free plan every deploy would wipe accounts and orders. |
| Region | Singapore (closest to India). |

## First deploy

1. Sign in at render.com with GitHub and allow access to `nuvora909/nuvora`.
2. **New → Blueprint**, pick the repository and the `main` branch.
3. Render lists every variable marked `sync: false` in `render.yaml`. Fill them in from your local `.env`, but use **new** PayPal and AI keys, not the ones that were exposed. Leave any you don't use empty.
4. Apply. The first build takes a few minutes; the site then runs at `https://nuvora.onrender.com` (or the name Render shows).

## After it is live

- **Google sign-in:** in Google Cloud Console → Credentials → your OAuth client, add the Render URL to *Authorised JavaScript origins*.
- **PayPal:** use the live app's client ID and secret, with `PAYPAL_MODE=live`.
- **Custom domain:** Render → the service → Settings → Custom Domains; then add that domain to Google's origins too.
- Every push to `main` redeploys automatically. The databases on the disk are kept.
- Memory: the app uses about 270 MB at rest. Starter has 512 MB; if Render reports out-of-memory restarts, move to Standard.
