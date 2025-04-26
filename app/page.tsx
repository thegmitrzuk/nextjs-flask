'use client'

import AudioRecorder from './components/AudioRecorder'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-12 text-center">
        Live Audio Transcription & Summarization
      </h1>
      <AudioRecorder />
    </main>
  )
}
