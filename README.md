# Velvet Royals Flowershop

The online shop for Velvet Royals Flowershop (Oud Metha, Dubai), live at **https://velvetroyals.com**.
Customers browse bouquets and gifts, pay by card through Geidea and track their orders; staff run
the shop from the admin dashboard at `/admin`.

## How it is built

- **Website:** plain HTML, CSS and JavaScript in `src/` (no build step).
- **Firebase project `flowershop-d26f4`:**
  - Hosting serves `src/` at velvetroyals.com, with short addresses such as `/products` and `/admin` (`firebase.json`).
  - Realtime Database (asia-southeast1) holds products, orders, customers, reviews, messages, coupons and agents. Access rules: `database.rules.json`.
  - Storage holds product photos (`products/`) and profile photos (`avatars/`). Access rules: `storage.rules`.
  - Authentication: email and password accounts. Admins are users whose `role` is `admin` in the database.
  - Cloud Functions in `functions/` (Node 20, us-central1): Geidea payments and webhook, stock, order cleanup,
    order tracking, order emails, admin permissions and "sign out of all devices".
- **Outside Firebase:** the domain and DNS are at Cloudflare, card payments go through Geidea, and order
  emails are sent from a Gmail account.

## Folders

| Path | What it is |
| --- | --- |
| `src/index.html`, `src/pages/` | The website pages |
| `src/js/` | Shop logic (`app.js`), sign-in and profiles (`auth.js`), admin (`crud.js`, `price-import.js`, `photo-cleanup.js`, `admin-*.js`) |
| `src/css/` | Styles (`styles.css`, `responsive.css`) |
| `functions/` | Server functions (`index.js`), price checks (`pricing.js`), unpaid-order rules (`order-lifecycle.js`) and their tests |
| `scripts/`, `tests/`, root `*.js` files | Developer tools and old test scripts. They are not part of the website and are never deployed |

## Setting up

1. Install Node.js 20 and the Firebase tool: `npm install -g firebase-tools`, then `firebase login`.
2. Create `functions/.env` with the secret keys. This file is never committed; the shop holds it.
   Keys used: `GMAIL_USER`, `GMAIL_APP_PASS`, `ADMIN_EMAIL`, `GEIDEA_PUBLIC_KEY`, `GEIDEA_API_PASSWORD`,
   `GEIDEA_API_BASE`, `GEIDEA_HPP_BASE`, `GEIDEA_WEBHOOK_ALLOW_UNSIGNED` (keep off), and optionally
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `WHATSAPP_API_KEY`, `WHATSAPP_PHONE`.
3. `cd functions && npm install`.

## Deploying

| What changed | Command |
| --- | --- |
| Pages, styles, scripts | `firebase deploy --only hosting` |
| Server functions | `firebase deploy --only functions` |
| Database rules | `firebase deploy --only database` |
| Storage rules | `firebase deploy --only storage` |
| Try a change privately | `firebase hosting:channel:deploy preview --expires 2d` |

Browsers cache scripts and styles for a day: after changing one, raise its `?v=` number in the pages
that load it. Function tests: `node pricing.test.js` and `node order-lifecycle.test.js` in `functions/`.

## Admins

Create the person's account at `/login`, then in the Firebase console set `users/<their id>/role` to
`admin`. Their photo permissions follow automatically. Set it back to `user` to remove them.
