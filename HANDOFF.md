# Content Upload Automation — Handoff

**Repo**: `serbayarda/wordpress`
**Branch**: `claude/content-upload-wordpress-automation-9Kk28`
**Owner**: Serbay Arda (serbayarda@gmail.com)
**Status**: Code complete, untested against live services. Awaiting credentials + first deploy.

---

## 1. What it does

An always-on Node.js worker that turns `.docx` / Google Docs files dropped into a Drive folder into WordPress drafts — with one AI-generated image per H2 section — rendered using the client's custom Gutenberg block template.

Pipeline:

```
Drive (Pending folder)
  └─► download (.docx or Google Doc)
        └─► parse HTML, split by <h2> into sections
              └─► for each section: LLM writes image prompt → image API renders → upload to WP media
                    └─► render macplus block template
                          └─► POST /wp-json/wp/v2/posts (status=draft)
                                └─► move Drive file to Processed/
```

First brand: **Macfit** (https://www.macfit.com). Designed for multi-brand from day one — adding a new brand = drop a new JSON in `brands/`.

## 2. Tech stack

- **Runtime**: Node.js 20, TypeScript
- **Hosting**: Railway (single long-running container)
- **Drive**: Google service account, `googleapis` SDK
- **Doc parsing**: `mammoth` for `.docx`, Drive HTML export for Google Docs
- **HTML parsing**: `node-html-parser`
- **LLM** (prompt generation): OpenAI `gpt-4o-mini`
- **Image generation**: OpenAI `gpt-image-1` (Gemini `2.5-flash-image` available as alt provider, per-brand config)
- **WordPress**: REST API v2 + Application Passwords (Basic auth)
- **State**: JSON file per brand in `state/` (persisted to a Railway volume)

## 3. Inputs (content team)

Article files placed in the **Pending** Drive folder. Must contain:

- One `H1` → becomes the post title.
- N × `H2` → each becomes a `wp:macplus/blog-content-section` with paragraphs / lists / one image.
- Paragraphs and bullet lists inside each section.
- Real Word heading styles (not bold + larger font).
- Turkish text (LLM prompt generation handles it).

`.docx` and native Google Docs both supported.

## 4. Outputs (WordPress)

A **draft** post created via REST API with this block structure:

```
wp:macplus/blog-title
wp:macplus/blog-spot-image     ← hero image (featured)
wp:macplus/blog-content
  └─ N × wp:macplus/blog-content-section
       ├─ wp:heading (h2)
       ├─ wp:paragraph (×N)
       ├─ wp:list (optional)
       └─ wp:image (section illustration)
wp:macplus/blog-featured-post
```

Status = `draft`. Featured image = hero. Category + author = brand defaults (optional).

Source Drive file is moved to **Processed/** after successful post creation. Failures keep the file in Pending and retry on the next poll.

## 5. Configuration

### Per-brand JSON: `brands/<id>.json`

```json
{
  "id": "macfit",
  "name": "Macfit",
  "language": "tr",
  "drive": {
    "pendingFolderId": "<google drive folder id>",
    "processedFolderId": "<google drive folder id>"
  },
  "wordpress": {
    "baseUrl": "https://www.macfit.com",
    "username": "",                 // resolved from env
    "applicationPassword": "",      // resolved from env
    "defaultCategoryId": null,
    "defaultAuthorId": null
  },
  "image": {
    "provider": "openai",           // or "gemini"
    "size": "1792x1024",
    "style": "...",                 // appended to every image prompt
    "negative": "..."
  },
  "template": "macplus-default",
  "featuredPosts": { "count": 3, "sameCategoryOnly": true }
}
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_B64` | yes | Service account JSON, base64-encoded |
| `OPENAI_API_KEY` | yes | LLM prompts + image generation |
| `GEMINI_API_KEY` | only if a brand uses `provider: "gemini"` | Image generation |
| `<BRAND>_WP_USERNAME` | yes | WP user, per brand (e.g. `MACFIT_WP_USERNAME`) |
| `<BRAND>_WP_APP_PASSWORD` | yes | WP Application Password, per brand |
| `POLL_INTERVAL_SECONDS` | optional (default `120`) | How often to scan Drive |
| `STATE_DIR` | optional (default `./state`) | Set to volume mount path on Railway |
| `BRANDS_DIR` | optional (default `./brands`) | Brand configs directory |

## 6. External accounts to set up

1. **Google Cloud project** + service account with Drive API enabled. JSON key downloaded.
2. **Two Drive folders per brand** (`Pending`, `Processed`), shared with the service account email as Editor.
3. **OpenAI account** with `gpt-image-1` access (org verification may be required) and a billing card.
4. **WordPress Application Password** generated for the publishing user. Requires WP 5.6+ and the feature enabled (default on).
5. **Railway project** linked to the GitHub repo, with a persistent volume mounted at `/data` and `STATE_DIR=/data/state`.

## 7. Run modes

| Command | Use case |
|---|---|
| `npm run start` | Production (Railway) — polls forever |
| `npm run once` | Single tick, exits — useful for cron |
| `npm run dry-run` | Generates images, writes HTML to `tmp/` — no WP/Drive writes |
| `npm run dry-run:no-images` | Uses placeholder image URLs — fast, free, validates template |
| `npm run typecheck` | TS check, no execution |

CLI flags: `--once`, `--dry-run`, `--skip-images`, `--brand <id>`.

## 8. Resilience guarantees

- **Resumable**: per-file state in `state/<brand>.json`. A crash mid-article doesn't re-charge image gen on restart — already-uploaded media is reused, only missing steps re-run.
- **Idempotent Drive move**: if WP post creation succeeded but Drive move failed, next tick retries the move only.
- **Per-section failure tolerated**: a single section image failure leaves that section without an image but doesn't block the post.
- **Restart policy** on Railway: `ON_FAILURE`, max 5 retries.

## 9. What the automation team needs to finalize

Concrete checklist:

- [ ] Provision Google Cloud service account, enable Drive API, download JSON key, base64 it.
- [ ] Create `Macfit / Pending` and `Macfit / Processed` Drive folders. Share both with service account email. Copy folder IDs.
- [ ] Edit `brands/macfit.json` and fill `drive.pendingFolderId` + `drive.processedFolderId`. Commit + push.
- [ ] (Optional) Set `wordpress.defaultCategoryId` and `wordpress.defaultAuthorId` in `brands/macfit.json`.
- [ ] Get OpenAI API key. If using image gen, verify org for `gpt-image-1` access.
- [ ] Generate WP Application Password for the publishing user.
- [ ] Deploy to Railway: connect repo, set env vars (see table above), add volume at `/data`, set `STATE_DIR=/data/state`.
- [ ] Run `npm run dry-run:no-images` locally first to validate Drive + parsing.
- [ ] Drop a real `.docx` in Pending and verify end-to-end on Railway.
- [ ] Confirm draft renders correctly in WP block editor (macplus blocks intact, images placed, featured image set).

## 10. Known limitations / open questions

- **Featured-post block (`wp:macplus/blog-featured-post`)** is rendered with the static `title` attribute only. The worker does not inject specific post IDs — the theme is assumed to pick the related posts. If explicit IDs are required, share an example block with chosen IDs and we'll wire the renderer to populate them.
- **Spot image block** is rendered with a minimal attribute set (`{id, url, alt, mime}`). The full editor-state metadata in the original example is auto-filled by WP on load. If the block fails to render in the editor, share the rendered DOM and we'll match the schema exactly.
- **Image style** is fixed per brand (`image.style` in JSON). No per-section style overrides. Easy to add if needed.
- **No alerting** on failure. Slack/Discord webhook can be added — say the word.
- **No web dashboard**. Status visible via Railway logs and the `state/` file only. A small Next.js admin UI on Vercel can be added in a separate phase.

## 11. Cost estimate (per article, OpenAI)

- 1 hero + ~8 section prompts via `gpt-4o-mini`: ~$0.001
- 9 images via `gpt-image-1` (1792×1024, standard quality): ~$0.30
- Total per article: ~$0.30

For ~100 articles/month, budget ~$30/month + Railway (~$5–10/month).

## 12. Contacts

- Code questions: repo issues on `serbayarda/wordpress`
- WP credentials / access: Serbay
- Drive folder permissions: Serbay
- Cost / billing alerts: Serbay (set at https://platform.openai.com/account/limits)
