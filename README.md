# Site Visit Log

Field survey notebook for commercial kitchen and cold room projects: draw the site to scale,
drop CAD-style blocks, keep the bill of quantities beside the plan, and export a PDF report
that carries the surveyor's name.

Stack: static HTML app + Supabase (auth, Postgres) + one Vercel serverless function.

---

## 1. Create the Supabase project

1. supabase.com → **New project**. Keep the database password somewhere safe.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   This creates `profiles` and `visits`, the row level security policies, and the trigger
   that gives every new auth user a profile row.
3. **Project Settings → API**, copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (secret — server side only, never in the browser)

## 2. Create your own account

**Authentication → Users → Add user** → your email + password, and tick *Auto Confirm User*.
Then make yourself admin (SQL Editor):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@company.com');
```

Only admins see the users panel and can create other accounts from inside the app.

## 3. Put the code on GitHub

```bash
cd site-visit-log
git init
git add .
git commit -m "Site Visit Log"
git branch -M main
git remote add origin https://github.com/<your-user>/site-visit-log.git
git push -u origin main
```

Before pushing, open `config.js` and paste your **Project URL** and **anon public key**.
The anon key is meant to be public — row level security is what protects the data.

## 4. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Other**. No build command, output directory: `.` (root).
3. **Settings → Environment Variables**, add (these stay server side, for `/api/create-user`):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your `service_role` key |

4. Deploy. Every `git push` from now on redeploys automatically.

## 5. Daily use

- The app opens on a **new empty visit** dated today.
- **+ New visit** / **Visits (n)** / the search box are at the top.
- The current visit is saved to Supabase **every 30 seconds**, when you switch visits,
  when you save the visit details, and when you leave the page.
- **Export PDF** prints the visit header (client, site, city, date, GPS, and
  *Surveyed by: <your name>*), the plan, and the item table.

## Item thumbnails

Every item shows a thumbnail. Priority:

1. a photo uploaded for **that one item**;
2. the **type thumbnail** — your own drawing for that type (work table, sink, hood …),
   stored once in `type_thumbs` and used by every item of that type;
3. the built-in isometric drawing.

Open an item → **Upload for this type** to replace the default with a SolidWorks or AutoCAD
export. **Back to the default drawing** removes it again. Type thumbnails are shared by the
whole team.

## Block symbols (plan view)

The blocks you drop on the plan use built-in symbols. To use your own factory drawings,
select a block on the plan → **Replace symbol (SVG)** and upload an SVG shaped like this:

```svg
<svg viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg">
  <g id="frame">...</g>   <!-- stretches with the block's width and depth -->
  <g id="detail">...</g>  <!-- keeps its proportions, stays centred -->
</svg>
```

- `viewBox` units are millimetres, and its size is the reference size of the symbol.
- Put the outline, edges and shelf lines in `frame`; put circles (burners, bowls, fans) in `detail`
  so they stay round when the block is resized.
- `fill="none"`, no text, no embedded images. An SVG with no ids is treated as all-frame.
- Export from AutoCAD with `EXPORTSVG`, or DXF → Inkscape/Illustrator → Save as SVG.

Symbols are stored in `block_svgs` and shared by the whole team. **Restore built-in symbol**
removes yours again.

## Data model

`visits` keeps one row per site visit. The drawing itself lives in the `data` jsonb column:

```jsonc
{
  "mode": "draw",
  "img": null,                  // uploaded plan photo (data URL) if used
  "view": { "x": 0, "y": 0, "w": 6000, "h": 4000 },
  "draw": { "pts": [[0,0],[4000,0]], "closed": true, "kinds": ["wall","panel"] },
  "blocks": [ { "id":1, "k":"sink2", "x":200, "y":50, "w":1220, "d":700, "rot":0, "item":4 } ],
  "items":  [ { "no":4, "ar":"حوض مزدوج", "en":"Double bowl sink",
                "dim":"1220 × 700 × 850", "qty":1, "type":"sink" } ]
}
```

Keeping it as one jsonb document means the drawing engine can evolve without a migration.
If you later want reporting across visits (total panels per project, item counts per client),
promote `items` into its own table and join on `visit_id`.

## Notes and limits

- **Photos** are stored inline as data URLs. That is fine for a few site photos; if you start
  uploading many, move them to Supabase **Storage** and keep only the public URL in `data.img`.
- **Offline**: with no connection the save fails and the status shows a warning. If you often
  survey basements with no signal, the next step is caching the visit locally and syncing on
  reconnect.
- **Cloud settings** on the sign-in screen let you paste the URL and anon key at runtime
  (stored in that browser), useful for testing before the first deploy.
- Without any Supabase config the app still runs in device-only mode, saving to that browser.
