# Next.js + Flask Audio Transcription Starter

This repository contains a hybrid Next.js frontend and Flask API backend that records audio in 30-second intervals, sends it to ElevenLabs Scribe v1 for speech-to-text with speaker diarization, and displays a clean, diarized transcript.

## Prerequisites

- Git
- Node.js (v18 or later)
- npm or pnpm (Node package manager)
- Python 3.9+ and `pip`
- ElevenLabs API Key (create an account at [ElevenLabs](https://elevenlabs.io))

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/your-repo.git
   cd your-repo/nextjs-flask
   ```

2. Create a `.env` file in the `nextjs-flask` directory with your ElevenLabs API key:
   ```bash
   cat > .env <<EOF
   ELEVENLABS_API_KEY=your_real_api_key_here
   EOF
   ```

3. Install Node.js dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

4. Install Python dependencies:
   ```bash
   pip3 install -r requirements.txt
   ```

5. Run the development servers concurrently:
   ```bash
   npm run dev
   ```

   - **Next.js** frontend will start on `http://localhost:3000` (or the next available port).
   - **Flask** backend will run on `http://127.0.0.1:5328`.

6. Open your browser to the Next.js URL (e.g. `http://localhost:3000`) and:
   - Click **Start Recording** to begin capturing audio.
   - Every 30 seconds (or when you click **Stop Recording**), the full audio is sent to ElevenLabs.
   - The clean, diarized transcript segments will appear below the recorder.

## Scripts

- `npm run dev`: Run Next.js and Flask dev servers in parallel.
- `npm run next-dev`: Run only the Next.js dev server.
- `npm run flask-dev`: Run only the Flask dev server with debug mode.
- `npm run build`: Build Next.js for production.
- `npm start`: Run the built Next.js application (requires a separate production deployment of Flask).

## Deployment

- In production, you can deploy:
  - Next.js on Vercel, Netlify, or any static host.
  - Flask API as serverless functions on Vercel (Python Runtime) or via a WSGI host (Heroku, AWS Elastic Beanstalk, etc.).

Make sure to set the `ELEVENLABS_API_KEY` environment variable in your production environment.

---

Enjoy your real-time, diarized speech-to-text application! Feel free to customize and extend. We welcome contributions. Happy coding!
