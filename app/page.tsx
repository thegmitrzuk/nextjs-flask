'use client'

import { useState } from 'react';
import AudioRecorder from './components/AudioRecorder'
import AgendaSaver from './components/AgendaSaver';

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col items-center justify-center p-6 sm:p-8">
      <div className="max-w-3xl w-full flex flex-col items-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8 sm:mb-12 text-center text-gray-800 dark:text-gray-100">
          Voice Transcription & <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500">AI Summary</span>
        </h1>
        <AudioRecorder>
          <AgendaSaver />
        </AudioRecorder>
      </div>

    </main>
  )
}
