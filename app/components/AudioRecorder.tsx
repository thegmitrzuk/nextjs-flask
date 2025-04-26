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

interface AudioRecorderProps {
  isDisabled: boolean;
}

export default function AudioRecorder({ isDisabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcriptions, setTranscriptions] = useState<TranscriptionData[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcmDataRef = useRef<Float32Array[]>([])
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const [audioLevels, setAudioLevels] = useState<number[]>([])
  const visualizerBars = 48 // Number of bars in the visualizer

  const INTERVAL_TIME = 30000 // 30 seconds in milliseconds

  const startRecording = async () => {
    try {
      // Clear previous transcript file
      try {
        await fetch('/api/clear-transcript', { method: 'POST' });
      } catch (e) {
        console.error('Failed to clear transcript file:', e);
      }

      // Clear any existing streams or intervals
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current)
      if (scriptNodeRef.current) scriptNodeRef.current.disconnect()
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())

      // Reset buffers & UI state
      pcmDataRef.current = []
      setTranscriptions([])
      setSummary(null)
      setError(null)

      // Acquire mic and hook into Web Audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      scriptNodeRef.current = processor
      source.connect(processor)
      processor.connect(audioCtx.destination)
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        pcmDataRef.current.push(new Float32Array(input))
      }

      // Start timers and UI
      startTimeRef.current = Date.now()
      setIsRecording(true)
      startTimer()

      // Emit a WAV chunk every 30s
      chunkIntervalRef.current = setInterval(() => sendWavChunk(), INTERVAL_TIME)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('Could not access microphone. Please grant permission.')
    }
  }

  const stopRecording = async () => {
    // Send any remaining audio data before cleanup
    if (pcmDataRef.current.length > 0) {
      try {
        await sendWavChunk();
      } catch (e) {
        console.error('Error sending final chunk:', e);
      }
    }

    // Clear UI timer and chunk timer
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null }

    // Tear down audio nodes and stop mic
    if (scriptNodeRef.current) scriptNodeRef.current.disconnect()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioContextRef.current) audioContextRef.current.close()

    setIsRecording(false)
    setRecordingTime(0)
  }

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      const currentTime = Date.now()
      const elapsedTime = Math.floor((currentTime - startTimeRef.current) / 1000)
      setRecordingTime(elapsedTime)

      // No need to manually trigger sends here: ondataavailable fires per chunk
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setAudioLevels(Array.from({ length: visualizerBars }, () => Math.random() * 100))
      }, 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevels([])
    }
  }, [isRecording, visualizerBars])

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

  // Helper: encode Float32 buffers into a WAV Blob
  function encodeWAV(buffers: Float32Array[], sampleRate: number): Blob {
    const total = buffers.reduce((sum, b) => sum + b.length, 0)
    const buffer = new ArrayBuffer(44 + total * 2)
    const view = new DataView(buffer)
    function wStr(o: number, s: string) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    wStr(0, 'RIFF'); view.setUint32(4, 36 + total*2, true)
    wStr(8, 'WAVE'); wStr(12, 'fmt '); view.setUint32(16, 16, true)
    view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate*2, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    wStr(36, 'data'); view.setUint32(40, total*2, true)
    let offset = 44
    buffers.forEach(b => {
      for (let i = 0; i < b.length; i++) {
        const s = Math.max(-1, Math.min(1, b[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
        offset += 2
      }
    })
    return new Blob([view], { type: 'audio/wav' })
  }

  // Replace previous sendAudioData
  async function sendWavChunk() {
    if (!audioContextRef.current) return
    const buffers = pcmDataRef.current
    if (buffers.length === 0) return
    const sampleRate = audioContextRef.current.sampleRate
    const wavBlob = encodeWAV(buffers, sampleRate)
    pcmDataRef.current = []
    const formData = new FormData()
    formData.append('audio', wavBlob, `chunk_${Date.now()}.wav`)
    const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0)
    formData.append('duration', String(Math.round(totalSamples / sampleRate)))
    try {
      const res = await fetch('/api/save-audio', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.transcription) setTranscriptions(prev => [...prev, data.transcription])
      else if (data.error) setError(`Transcription Error: ${data.error}`)
    } catch (e: any) {
      console.error('Error sending WAV chunk:', e)
      setError(`Operation failed: ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-8 w-full max-w-3xl">
      {/* Modern Recording UI */}
      <div className="flex flex-col items-center space-y-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 scale-105 drop-shadow-lg'
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          disabled={isDisabled}
          title={isDisabled ? "Please save the agenda first" : (isRecording ? "Stop recording" : "Start recording")}
        >
          {isRecording ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 448 512">
              <path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 352 512">
              <path d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z"/>
            </svg>
          )}
        </button>
        
        {isDisabled && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
            Please save the agenda below before starting the recording.
          </p>
        )}

        <span className={`font-mono text-sm transition-opacity duration-300 ${isRecording ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
          {formatTime(recordingTime)}
        </span>

        {/* Audio Visualizer */}
        <div className="h-8 w-64 flex items-center justify-center gap-0.5 mt-2">
          {[...Array(visualizerBars)].map((_, i) => (
            <div
              key={i}
              className={`w-0.5 rounded-full transition-all duration-300 ${
                isRecording
                  ? 'bg-blue-500/70 dark:bg-blue-400/70 animate-pulse'
                  : 'bg-gray-300/30 dark:bg-gray-600/30 h-1'
              }`}
              style={
                isRecording
                  ? {
                      height: `${Math.max(10, Math.min(100, audioLevels[i] || 0))}%`,
                      animationDuration: '0.8s',
                      animationDelay: `${i * 0.02}s`,
                    }
                  : undefined
              }
            />
          ))}
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-300 h-4">
          {isRecording ? 'Listening...' : 'Click to speak'}
          {isRecording && (
            <span className="ml-2 text-xs text-gray-500">
              Next send in {30 - (recordingTime % 30)}s
            </span>
          )}
        </p>
      </div>
      
      {error && (
        <div className="w-full text-center text-red-500 bg-red-100 dark:bg-red-900/30 dark:text-red-300 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Summarize Button - Only show if there are transcriptions */}
      {transcriptions.length > 0 && (
        <button
          onClick={handleSummarize}
          disabled={isSummarizing}
          className={`px-6 py-2 rounded-full text-white transition-colors ${isSummarizing 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-green-500 hover:bg-green-600'}`}
        >
          {isSummarizing ? 'Summarizing...' : 'Summarize Conversation'}
        </button>
      )}

      {/* Display summary */}
      {summary && (
        <div className="w-full bg-blue-50 dark:bg-blue-900/30 p-6 rounded-lg border border-blue-100 dark:border-blue-800">
          <h3 className="text-xl font-semibold mb-3 text-blue-900 dark:text-blue-100">Summary</h3>
          <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Transcriptions Display */}
      {transcriptions.length > 0 && (
        <div className="w-full">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Transcript</h3>
          <div className="space-y-4">
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
                
                // Map speaker_ids to different colors consistently
                const speakerColorClasses = [
                  'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800',
                  'bg-green-50 dark:bg-green-900/30 border-green-100 dark:border-green-800',
                  'bg-purple-50 dark:bg-purple-900/30 border-purple-100 dark:border-purple-800',
                  'bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800',
                ];
                const colorIndex = parseInt(seg.speaker.replace(/\D/g, '')) % speakerColorClasses.length;
                const colorClass = speakerColorClasses[colorIndex];
                
                return (
                  <div key={`${tIndex}-${sIndex}`} className={`p-4 rounded-lg border ${colorClass}`}>
                    <div className="flex justify-between text-sm">
                      <div className="text-gray-500">{formatTime(startSec)} - {formatTime(endSec)}</div>
                      <div className="font-medium">{speakerLabel}</div>
                    </div>
                    <div className="mt-2 text-gray-800 dark:text-gray-100">{text}</div>
                  </div>
                );
              });
            })}
          </div>
        </div>
      )}
    </div>
  )
} 