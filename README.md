# Geechee One Universe

The public film catalog website for Geechee One Universe, with an admin area at `/admin`.
Built with Hono, React, Vite, Tailwind, Postgres, a Railway bucket and Redis. See `CLAUDE.md` for the full build brief.

## Running on Railway

Railway builds from the `main` branch on GitHub and redeploys on every push.

- Build command: `npm run build`
- Start command: `npm start`
- The health check is at `/api/health`. It shows `"db":"ok"` and `"storage":"configured"` when things are set up.

### Variables (Railway → your app service → Variables)

| Name | What it is |
|---|---|
| `DATABASE_URL` | Postgres address (reference the Postgres service) |
| `REDIS_URL` | Redis address. Optional: without it, rate limiting is off |
| `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` | Image storage bucket |
| `BUCKET_ENDPOINT` (or `BUCKET_URL`) | The bucket's address |
| `JWT_SECRET` | A long random text that signs admin logins |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The one admin account, created on first start |
| `TMDB_API_KEY` | Film data import from TMDB |
| `TMDB_WATCH_REGION` | Optional. Two-letter country for "where to watch" data. Default `US` |
| `PUBLIC_SITE_URL` | The site's real address, like `https://www.geecheeoneuniverse.com`. Used in link previews, the sitemap and robots.txt |

## Using your own domain

1. In Railway, open the app service, then **Settings → Networking → Custom Domain → Add Custom Domain**.
2. Type your domain, for example `www.geecheeoneuniverse.com`. Railway shows a **CNAME** record (a name and a value).
3. Sign in where you bought the domain (GoDaddy, Namecheap, Google Domains, etc.) and open its **DNS settings**.
4. Add a record: type **CNAME**, name `www`, value exactly what Railway showed. Save.
5. Wait. This usually takes a few minutes, sometimes up to a few hours. Railway shows a green check when it works and sets up the https padlock on its own.
6. For the bare domain (`geecheeoneuniverse.com` without `www`): Railway shows a different record for it. Many domain companies can't use a CNAME on the bare domain. If yours can't, use their "redirect" or "forwarding" feature to send the bare domain to `https://www.…`.
7. When the domain works, go back to **Variables** and set `PUBLIC_SITE_URL` to the new address, with `https://` and no slash at the end. Railway redeploys. This makes shared links, the sitemap and robots.txt use your real domain.
8. Check it: open `https://your-domain/robots.txt` and `https://your-domain/sitemap.xml`. Both should list your domain.

## Link previews

When someone shares `https://your-domain/films/<film>` on Facebook, Instagram or in a text, the film's poster, title and synopsis show in the preview. Only films that are live (Released or Coming soon) get these previews.

After changing a poster, social sites may keep showing the old one for a while. Facebook's **Sharing Debugger** (developers.facebook.com/tools/debug) can refresh it.
