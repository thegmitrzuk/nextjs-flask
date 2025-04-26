'use client'

import { useState, useRef, useEffect } from 'react'

export default function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcriptFilepath, setTranscriptFilepath] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
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
      // Clear any existing streams or intervals
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current)
      if (scriptNodeRef.current) scriptNodeRef.current.disconnect()
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())

      // Reset buffers & UI state
      pcmDataRef.current = []
      setTranscriptFilepath(null)
      setAnalysisResult(null)
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

  const handleAnalyze = async () => {
    if (!transcriptFilepath) {
        setError("No transcript available to analyze. Please record audio first.")
        return
    }
    setIsAnalyzing(true)
    setError(null)
    setAnalysisResult(null)
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_filepath: transcriptFilepath }),
      })
      const data = await response.json()
      if (response.ok) {
        if (data.summary) {
            setAnalysisResult(`Summary: ${data.summary}`)
        } else if (data.result) {
            setAnalysisResult(`Result: ${data.result}`)
        } else {
            setAnalysisResult(`Analysis complete: ${JSON.stringify(data)}`)
            console.warn("Unexpected response structure from /api/summarize:", data)
        }
      } else {
        setError(data.error || 'Analysis failed')
      }
    } catch (e: any) {
      console.error('Analysis error:', e)
      setError(`Analysis error: ${e.message}`)
    } finally {
      setIsAnalyzing(false)
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
      if (res.ok && data.transcript_filepath) {
        setTranscriptFilepath(data.transcript_filepath)
        console.log("Transcript saved to:", data.transcript_filepath)
        setError(null)
      } else {
        const errorMessage = data.error || `Server responded with status ${res.status}`
        setError(`Transcription Error: ${errorMessage}`)
        console.error("Transcription error response:", data)
      }
    } catch (e: any) {
      console.error('Error sending WAV chunk:', e)
      if (e instanceof TypeError && e.message.includes('JSON')) {
          setError('Operation failed: Server sent an invalid response.')
      } else {
          setError(`Operation failed: ${e.message}`)
      }
    }
  }

  return (
    <div className="flex flex-col items-center space-y-8 w-full max-w-3xl">
      {/* Modern Recording UI */}
      <div className="flex flex-col items-center space-y-4">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 scale-105 drop-shadow-lg' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
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

      {/* Action Buttons (only show Analyze when not recording and transcript exists) */}
      {!isRecording && transcriptFilepath && (
        <div className="flex space-x-4 mt-6">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="px-5 py-2 rounded-md bg-green-500 text-white font-medium hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Transcript'}
          </button>
        </div>
      )}

      {/* Analysis Result Display */}
      {analysisResult && (
        <div className="mt-6 w-full p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-100">Analysis Result</h3>
          <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{analysisResult}</p>
        </div>
      )}
    </div>
  )
} 