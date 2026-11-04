# Poplar Dental Practice website

A fast, static website for Poplar Dental Practice, 1 Poplar Road, Sparkhill, Birmingham B11 1UH.
Plain HTML, CSS and a little JavaScript, hosted on Netlify. Planned address: **https://www.poplardentalsparkhill.co.uk**

## Pages

| Page | File |
|---|---|
| Home | `index.html` |
| Treatments (overview + 7 treatment pages) | `treatments.html`, `check-ups-and-cleaning.html`, `fillings.html`, `crowns-and-bridges.html`, `gum-disease.html`, `root-canal.html`, `tooth-extraction.html`, `braces.html` |
| New patients (with registration form) | `new-patients.html` |
| Urgent care | `urgent-care.html` |
| Our team | `team.html` |
| Contact | `contact.html` |
| Patient info (NHS charges, free care, complaints, privacy) | `patient-info.html` |
| Form sent, not found | `thank-you.html`, `404.html` (both hidden from search engines) |

## Preview and build

Needs Node.js 18 or newer.

```bash
node serve.mjs
```

That builds the site and serves it at http://localhost:4321. The registration form works in the preview, but submissions are only printed in the terminal, not sent anywhere. After editing, run `node build.mjs` and refresh.

## Where to edit

- `src/pages/` — the content of each page. The comment on the first line sets the page title and description.
- `src/partials/` — pieces shared across pages: opening hours, treatment cards, the map block, the call-to-action band, NHS charge bands, icons.
- `src/layout.html` — the header, menu, footer and mobile call bar used on every page.
- `assets/css/site.css` — colours, fonts and layout. The colour palette is at the top.
- `assets/js/site.js` — the live "Open now" status, mobile menu and form. Opening hours used by the live status are at the top.
- `assets/img/photos/` — stock photos from Pixabay, resized to WebP: the homepage hero (`hero.webp` 853×853, `hero-sm.webp` 960×720) and the treatment page headers (`name-lg.webp` 1200×800 plus `name.webp` 640×427). To swap one, replace the file and keep the name and size. Sources are in `PHOTO-CREDITS.md`. The hero is a placeholder: replace it with a real photo of the practice or team first. Team photos go on `team.html`.
- Design: warm ivory, forest green and sage, Newsreader for headings and Source Sans 3 for text. The colours are at the top of `site.css`. Keep corners small, shadows off and sections left-aligned.
- `static/_headers` — security headers Netlify adds to every page.
- `build.mjs` — `SITE_URL` at the top sets the domain used for canonical links, `sitemap.xml` and `robots.txt`.

`node build.mjs` writes the finished website to `site/`.

## Knowledge base for a chatbot

`knowledge-base/` holds everything on the website as a single document for a RAG (question-answering) system:

- `poplar-dental-knowledge-base.md` — the source. Edit this whenever the website changes. It's also the best file to load into most RAG tools.
- `Poplar-Dental-Knowledge-Base.docx` and `.pdf` — generated from the Markdown. To regenerate, run `npm install` once in that folder, then `node build-kb.mjs`. Microsoft Edge produces the PDF.

The first section, "How to use this document", works well as the assistant's instructions. The "Things the practice hasn't published" section stops it guessing.

## Chat assistant

The "Ask a question" button on every page is an automated assistant:

- **Website side:** `assets/js/chat.js` (panel and streaming), with styles under "Chat assistant" in `site.css`. The chat address is the `data-endpoint` on `<div id="chat-assistant">` in `src/layout.html`. Clear it to hide the chat.
- **n8n side:** the workflow "Poplar Dental website assistant" (https://n8n-a8un.srv2065226.hstgr.cloud/workflow/d4GQsyswi9qQ6MZR). Chat Trigger (Embedded Chat, streaming) → fetch `/knowledge-base.md` from the live site → AI Agent with Gemini 3.7 Flash and memory of the last 8 exchanges. Unpublish it in n8n to switch the assistant off instantly.
- **Updating what it knows:** edit `knowledge-base/poplar-dental-knowledge-base.md`, run `node build.mjs`, and deploy. The assistant reads the new file on the next message. Nothing needs changing in n8n.
- **Allowed websites:** the Chat Trigger's "Allowed origins" must be comma-separated with **no spaces**, otherwise only the first entry works. If the domain changes, add it there.
- **Cost:** about 9,600 Gemini tokens per message, roughly 0.7p. Enable billing on the Gemini API key, so Google doesn't use chats to improve its products, and set a budget cap.

## Going live on Netlify

**Before you start:** get the practice's sign-off on the content. Ideally, register the domain and Netlify account in the practice's name, or be ready to transfer them.

1. **Register the domain** `poplardentalsparkhill.co.uk` with any UK domain registrar, in the practice's name. If you choose a different domain, change `SITE_URL` in `build.mjs` and rebuild.
2. **Build:** run `node build.mjs`.
3. **Deploy:** log in at https://app.netlify.com, add a new project, choose to deploy manually, and drag the `site` folder onto the page.
4. **Switch on the form:** in the project, open **Forms** and select **Enable form detection**. Detection only starts from the next deploy, so drag the `site` folder on again.
5. **Email submissions to the practice:** in the project configuration, open **Notifications** and add a form submission email notification for the `register` form. Send it to the practice's email address.
6. **Test it:** on the `.netlify.app` address Netlify gives you, send a test registration and check the email arrives. Then delete the test entry under Forms.
7. **Connect the domain:** in **Domain management**, add `poplardentalsparkhill.co.uk`. Use Netlify DNS, which means changing the domain's nameservers at the registrar to the four Netlify shows you. Make **www.poplardentalsparkhill.co.uk** the primary domain so it matches `SITE_URL`. Netlify sets up HTTPS automatically once DNS has updated, which can take a few hours.
8. **Tell Google:** add the site to Google Search Console and submit `https://www.poplardentalsparkhill.co.uk/sitemap.xml`. Ask the practice to add the website address to their Google Business Profile.

To publish later changes, run `node build.mjs` and drag `site` onto the project's **Deploys** page.

### Netlify free plan limits

The free plan gives 300 credits a month:

- Form submissions cost nothing.
- Each production deploy costs 15 credits.
- Traffic costs 20 credits per GB. This site sends about 50 KB per visit from Netlify, so a few thousand visits a month use only a few credits.

If the credits run out, Netlify pauses the site until the next month. Batch your changes, and keep to roughly ten deploys a month.

## Still to confirm with the practice

1. **Opening hours**, including bank holidays. They're in `src/partials/hours.html`, the visit block and `assets/js/site.js`.
2. **Accessibility.** The two NHS.uk listings disagree about wheelchair and step-free access, so the site only says "call before your visit". Add the confirmed facilities to `patient-info.html#access`.
3. **Team.** Names, roles, GDC numbers and photos go in `src/pages/team.html`. Remove the yellow "to be added" badges.
4. **Photos and logo.** The design works without them, but real photos will help.
5. **Private treatment.** The site describes NHS care only.
6. **Privacy notice and complaints.** `patient-info.html` has drafts. The practice should check them against its own policies, including the Netlify data processing terms and the name of the local commissioner (NHS Birmingham and Solihull ICB). Form submissions should be deleted from Netlify once the patient has been contacted.
7. **Reviews.** Only quote reviews with the patient's permission.
8. **Domain.** `poplardentalpractice.co.uk` was registered in October 2025 and is parked at GoDaddy. If the practice owns it, use it instead.

## Sources for the practice details

- NHS.uk listing V004866: address, phone, opening times, treatments and new-patient status (last confirmed by the practice 18 September 2026)
- CQC location 1-198193249: provider, team size and the August 2022 inspection findings
