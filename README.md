# Live Basic Strategy Trainer

Practice perfect blackjack basic strategy — right from your phone.

## What It Does

This app helps you learn and drill **6-deck basic strategy** (S17, DAS allowed). Two modes:

- **Manual Mode** — Tap the dealer's upcard, tap your cards, then choose Hit / Stand / Double / Split. Instant feedback tells you if you got it right or what the correct play was.
- **Camera Mode** — Point your phone's camera at the table. The app uses computer vision to detect cards and tell you the correct play in real time. No AI models or cloud services — all processing happens on your device.

Tracks your accuracy across sessions so you can see yourself improve.

## Deploy to Your Phone

The easiest way to use this is to deploy it for free on [Vercel](https://vercel.com):

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account
2. Click **Add New Project** → import this repo
3. Click **Deploy**
4. Open the URL on your phone's browser
5. (Optional) Tap **Share → Add to Home Screen** to make it feel like a native app

## Camera Mode Tips

Camera-based card detection works best with:
- **Good lighting** — well-lit table, no harsh shadows
- **Standard playing cards** — white/light cards on a darker background (green or red felt)
- **Steady camera** — prop your phone up so it has a clear view of the cards
- **Cards not overlapping** — spread cards out so corners are visible

The camera uses traditional computer vision (thresholding, template matching) — not machine learning. It detects bright rectangular shapes and reads the rank from the top-left corner of each card.

If camera detection isn't working well in your conditions, switch to **Manual Mode** — it's fast and works perfectly every time.

## Strategy Reference

The app uses complete basic strategy tables for:
- **Hard totals** (5–21)
- **Soft totals** (A+2 through A+10)
- **Pairs** (2-2 through A-A)

Rules assumed: 6 decks, dealer stands on soft 17, double after split allowed.

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- Next.js 14 + React 18
- TypeScript
- Tailwind CSS
- Zustand (state management)
- IndexedDB (session history persistence)
- Pure canvas-based computer vision (no ML dependencies)
