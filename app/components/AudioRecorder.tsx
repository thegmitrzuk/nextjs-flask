'use client'

import { useState, useRef, useEffect } from 'react'

interface TranscriptionWord {
  text: string
  start: number
  end: number
  type: 'word' | 'spacing' | 'audio_event'
  speaker_id: string
}

interface TranscriptionData {
  language_code: string
  language_probability: number
  text: string
  words: TranscriptionWord[]
}

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcriptions, setTranscriptions] = useState<TranscriptionData[]>([])
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const [summary, setSummary] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)

  const INTERVAL_TIME = 30000 // 30 seconds in milliseconds

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      startTimeRef.current = Date.now()
      setTranscriptions([])
      setError(null)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      startTimer()
    } catch (error) {
      console.error('Error accessing microphone:', error)
      setError('Could not access microphone. Please grant permission.')
    }
  }

  const stopRecording = async () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      
      // Send the final recording
      await sendAudioData()
      
      setRecordingTime(0)
      audioChunksRef.current = []
    }
  }

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      const currentTime = Date.now()
      const elapsedTime = Math.floor((currentTime - startTimeRef.current) / 1000)
      setRecordingTime(elapsedTime)

      // Send accumulated audio every 30 seconds
      if (elapsedTime > 0 && elapsedTime % 30 === 0) {
        sendAudioData()
      }
    }, 1000)
  }

  const sendAudioData = async () => {
    if (audioChunksRef.current.length === 0) return

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    const formData = new FormData()
    formData.append('audio', audioBlob)
    formData.append('duration', String(recordingTime))
    setError(null)

    try {
      const response = await fetch('/api/save-audio', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        let errorMsg = `Server error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg; 
        } catch (parseError) {
          try {
             const textError = await response.text();
             if (textError) errorMsg = textError; 
          } catch (textReadError) {
            // Keep the original status code error if text reading fails
          }
        }
        throw new Error(errorMsg);
      }

      const data = await response.json()

      if (data.transcription) {
        setTranscriptions(prev => [...prev, data.transcription])
        console.log(data.message)
      } else if (data.error) {
        console.warn('Transcription failed (backend report):', data.error)
        setError(`Transcription Error: ${data.error}`)
      } else {
        console.warn('Unexpected success response format:', data)
        setError('Received unexpected data format from server.')
      }

    } catch (error: any) {
      console.error('Error sending/transcribing audio:', error)
      setError(`Operation failed: ${error.message}`)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSummarize = async () => {
    if (transcriptions.length === 0) return
    setIsSummarizing(true)
    setError(null)
    setSummary(null)
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcripts: transcriptions.map(t => ({ text: t.text })) }),
      })
      const data = await response.json()
      if (response.ok) {
        setSummary(data.summary)
      } else {
        setError(data.error || 'Summarization failed')
      }
    } catch (e: any) {
      console.error('Summarization error:', e)
      setError(`Summarization error: ${e.message}`)
    } finally {
      setIsSummarizing(false)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-8 bg-white dark:bg-zinc-800 rounded-xl shadow-lg w-full max-w-4xl">
      <h2 className="text-2xl font-bold mb-4">Audio Recorder</h2>
      <div className="flex space-x-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-6 py-2 rounded transition-colors ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-blue-500 hover:bg-blue-600'
          } text-white`}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>
      {error && (
        <div className="mt-4 text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded">
          {error}
        </div>
      )}
      {isRecording && (
        <div className="mt-4 text-xl">
          Recording Time: {formatTime(recordingTime)}
          <div className="text-sm text-gray-500 mt-1">
            Next automatic send in: {30 - (recordingTime % 30)} seconds
          </div>
        </div>
      )}

      {/* Summary button */}
      <button
        onClick={handleSummarize}
        disabled={transcriptions.length === 0 || isSummarizing}
        className={`px-6 py-2 mt-4 rounded text-white ${isSummarizing ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-600'}`}
      >
        {isSummarizing ? 'Summarizing...' : 'Summarize Conversation'}
      </button>

      {/* Display summary */}
      {summary && (
        <div className="w-full mt-6 bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Summary</h3>
          <p className="text-base whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Transcriptions Display */}
      <div className="w-full mt-8">
        <h3 className="text-xl font-semibold mb-4">Transcriptions</h3>
        <div className="space-y-6">
          {transcriptions.map((transcription, tIndex) => {
            const wordSegments = transcription.words.filter(w => w.type === 'word');
            if (wordSegments.length === 0) return null;
            // Group words into segments by speaker
            const segments: { speaker: string; words: typeof wordSegments }[] = [];
            let currentSpeaker = wordSegments[0].speaker_id;
            let currentWords = [wordSegments[0]];
            wordSegments.slice(1).forEach(w => {
              if (w.speaker_id === currentSpeaker) {
                currentWords.push(w);
              } else {
                segments.push({ speaker: currentSpeaker, words: currentWords });
                currentSpeaker = w.speaker_id;
                currentWords = [w];
              }
            });
            segments.push({ speaker: currentSpeaker, words: currentWords });
            // Render each speaker segment
            return segments.map((seg, sIndex) => {
              const startSec = Math.floor(seg.words[0].start);
              const endSec = Math.ceil(seg.words[seg.words.length - 1].end);
              const speakerLabel = seg.speaker.replace('speaker_', 'Speaker ');
              const text = seg.words.map(w => w.text).join(' ');
              return (
                <div key={`${tIndex}-${sIndex}`} className="bg-gray-50 dark:bg-zinc-700 p-4 rounded-lg">
                  <div className="flex justify-between text-sm text-gray-500">
                    <div>{formatTime(startSec)} - {formatTime(endSec)}</div>
                    <div className="font-semibold">{speakerLabel}</div>
                  </div>
                  <div className="mt-2 text-base whitespace-pre-wrap">{text}</div>
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  )
} 