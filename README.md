# SmbaMusic

SmbaMusic is a legit YouTube-powered music web app starter:

- Search via the YouTube Data API v3
- Play content in the official embedded YouTube player
- Keep a local queue inside a YouTube Music-inspired interface

## Run locally

1. Install dependencies with `npm install`
2. Copy `.env.example` to `.env.local`
3. Add your YouTube Data API key as `YOUTUBE_API_KEY`
4. Start the app with `npm run dev`

## Notes

- Some videos cannot be embedded because the uploader or YouTube blocks it.
- Playback stays inside the official YouTube embed.
- This project intentionally does not download or extract raw media streams.
