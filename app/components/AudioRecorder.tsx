'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'

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

// Type for Concept Explanations
interface Explanation {
  term: string;
  explanation: string;
}

// Define props to accept children and callback
interface AudioRecorderProps {
  children?: ReactNode; // Make children optional
  onTranscriptUpdate?: (transcript: string) => void; // Callback for transcript changes
  // Add props for agent data
  prompts: string[];
  currentItem: string | null;
  explanations: Explanation[];
  isLoadingAgents: boolean;
  agentError: string | null;
}

// Card Styling Wrapper Component
const Card = ({ title, children, loading }: { title: string; children: ReactNode, loading?: boolean }) => (
  <div className="bg-white dark:bg-gray-800/50 rounded-lg shadow-md p-4 ring-1 ring-slate-900/5 dark:ring-slate-200/10 transition-all duration-300 ease-in-out hover:shadow-lg hover:-translate-y-0.5">
    <h3 className="text-base font-semibold mb-2 flex items-center bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500">
      {/* Optional: Add icons here based on title */} 
      {title}
      {loading && <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-r-transparent" />} 
    </h3>
    <div className="text-sm text-gray-800 dark:text-gray-100 space-y-1">
      {children}
    </div>
  </div>
);

export default function AudioRecorder({
   children,
   onTranscriptUpdate,
   // Destructure new props
   prompts,
   currentItem,
   explanations,
   isLoadingAgents,
   agentError 
  }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcriptions, setTranscriptions] = useState<TranscriptionData[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [lastSentTranscriptLength, setLastSentTranscriptLength] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcmDataRef = useRef<Float32Array[]>([])
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const [audioLevels, setAudioLevels] = useState<number[]>([])
  const visualizerBars = 48 // Number of bars in the visualizer

  const INTERVAL_TIME = 20000 // 20 seconds in milliseconds

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
      setShowEmailInput(false)
      setEmailStatus(null)

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
    setShowEmailInput(false)
    setEmailStatus(null)
    try {
      // Combine transcriptions into a single string
      const combinedText = transcriptions.map(t => t.text).join('\n\n'); 
      
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_text: combinedText }), 
      })
      const data = await response.json()
      if (response.ok) {
        setSummary(data.summary)
        setShowEmailInput(true)
      } else {
        setError(data.error || 'Summarization failed')
        setShowEmailInput(false)
      }
    } catch (e: any) {
      console.error('Summarization error:', e)
      setError(`Summarization error: ${e.message}`)
      setShowEmailInput(false)
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleSendEmail = async () => {
    if (!summary || !recipientEmail) {
      setEmailStatus("Recipient email and summary are required.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      setEmailStatus("Please enter a valid email address.")
      return
    }

    setEmailStatus('Sending...')
    try {
      const response = await fetch('/api/send-summary-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipient_email: recipientEmail,
          summary_text: summary 
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setEmailStatus(`Email successfully sent to ${recipientEmail}`)
        setShowEmailInput(false)
        setRecipientEmail('')
      } else {
        setEmailStatus(`Failed to send email: ${data.error || 'Unknown server error'}`)
      }
    } catch (error: any) {
      console.error("Email sending error:", error);
      setEmailStatus(`Failed to send email: ${error.message}`)
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
      if (data.transcription) {
        setTranscriptions(prev => {
          const newTranscriptions = [...prev, data.transcription];
          // Combine text after state update
          const combinedText = newTranscriptions.map(t => t.text).join('\n\n');
          // Call callback if transcript has actually changed
          if (onTranscriptUpdate && combinedText.length > lastSentTranscriptLength) {
            onTranscriptUpdate(combinedText);
            setLastSentTranscriptLength(combinedText.length);
          }
          return newTranscriptions;
        });
      }
      else if (data.error) setError(`Transcription Error: ${data.error}`)
    } catch (e: any) {
      console.error('Error sending WAV chunk:', e)
      setError(`Operation failed: ${e.message}`)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-6 w-full max-w-3xl">
      {/* Modern Recording UI */}
      <div className="flex flex-col items-center space-y-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 bg-gradient-to-r from-blue-500 to-green-500 hover:brightness-105 hover:shadow-md ${
            isRecording ? 'scale-105 drop-shadow-lg' : ''
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 448 512">
              <path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 352 512">
              <path d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z"/>
            </svg>
          )}
        </button>

        <span className={`font-mono text-sm mt-1 transition-opacity duration-300 ${isRecording ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
          {formatTime(recordingTime)}
        </span>

        {/* Audio Visualizer */}
        <div className="h-8 w-64 flex items-center justify-center gap-0.5 mt-1">
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

        <p className="text-xs text-gray-600 dark:text-gray-300 h-4 mt-1">
          {isRecording ? 'Listening...' : 'Click to speak'}
          {isRecording && (
            <span className="ml-2 text-xs text-gray-500">
              Next send in {20 - (recordingTime % 20)}s
            </span>
          )}
        </p>
      </div>

      {/* == Render children (AgendaSaver) here == */}
      {children} 
      
      {/* Agent Outputs Section - Moved here - Add transitions */}
      {(prompts.length > 0 || currentItem || explanations.length > 0 || isLoadingAgents || agentError) && (
         <div className="mt-6 w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity duration-300 ease-in-out">
           
           {/* Current Agenda Item Card */}
            <Card title="Current Focus" loading={isLoadingAgents && !currentItem}>
               {currentItem ? (
                   <p>{currentItem}</p>
               ) : isLoadingAgents ? (
                    <p className="text-gray-500 dark:text-gray-400 italic">Loading...</p>
               ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">Waiting for discussion...</p>
               )}
            </Card>

           {/* Conversation Prompts Card */}
           <Card title="Prompts" loading={isLoadingAgents && prompts.length === 0}>
              {prompts.length > 0 ? (
               <ul className="list-disc list-inside space-y-1">
                 {prompts.map((prompt, index) => (
                   <li key={index}>{prompt}</li>
                 ))}
               </ul>
             ) : isLoadingAgents ? (
                   <p className="text-gray-500 dark:text-gray-400 italic">Loading...</p>
             ) : (
                 <p className="text-gray-500 dark:text-gray-400 italic">No prompts suggested.</p>
             )}
           </Card>

           {/* Concept Explanations Card */}
            <Card title="Key Concepts" loading={isLoadingAgents && explanations.length === 0}>
             {explanations.length > 0 ? (
               <ul className="space-y-2">
                 {explanations.map((exp, index) => (
                   <li key={index}>
                     <strong className="font-medium">{exp.term}:</strong>
                     <span className="ml-1 text-gray-600 dark:text-gray-300">{exp.explanation}</span>
                   </li>
                 ))}
               </ul>
             ) : isLoadingAgents ? (
                   <p className="text-gray-500 dark:text-gray-400 italic">Loading...</p>
             ) : (
                 <p className="text-gray-500 dark:text-gray-400 italic">No complex concepts detected.</p>
             )}
           </Card>

           {/* Agent Error Display - Add transitions */}
           {agentError && (
             <div className="md:col-span-3 mt-2 p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700/50 rounded-md transition-opacity duration-300 ease-in-out">
               <p className="text-sm text-red-700 dark:text-red-200"><strong className='font-medium'>Agent Error:</strong> {agentError}</p>
             </div>
           )}
         </div>
       )}

      {/* Error Display (for recorder/summary/email errors) - Add transitions */}
      {error && (
        <div className="w-full text-center text-red-500 bg-red-100 dark:bg-red-900/30 dark:text-red-300 p-3 rounded-lg transition-opacity duration-300 ease-in-out">
          {error}
        </div>
      )}

      {/* Summarize Button - Add ease-in-out and active:scale */}
      {transcriptions.length > 0 && (
        <button
          onClick={handleSummarize}
          disabled={isSummarizing}
          className={`px-6 py-2 rounded-full text-white transition-all duration-300 ease-in-out active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${isSummarizing 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-gradient-to-r from-blue-500 to-green-500 hover:brightness-105'}`}
        >
          {isSummarizing ? 'Summarizing...' : 'Summarize Conversation'}
        </button>
      )}

      {/* Display summary - Add transitions */}
      {summary && (
        <div className="w-full bg-blue-50 dark:bg-blue-900/30 p-6 rounded-lg border border-blue-100 dark:border-blue-800 transition-opacity duration-300 ease-in-out">
          <h3 className="text-xl font-semibold mb-2 text-blue-900 dark:text-blue-100">Summary</h3>
          <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Email Input Section - Shown after summary - Add transitions */}
      {showEmailInput && (
        <div className="w-full mt-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow-inner transition-opacity duration-300 ease-in-out">
          <label htmlFor="recipient-email" className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            Send Summary To:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              id="recipient-email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Enter recipient email address"
              className="flex-grow p-2 border border-gray-300 rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ease-in-out"
            />
            <button
              onClick={handleSendEmail}
              disabled={!recipientEmail || emailStatus === 'Sending...'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 ease-in-out active:scale-95 hover:-translate-y-0.5 hover:shadow-md"
            >
              {emailStatus === 'Sending...' ? 'Sending...' : 'Send Email'}
            </button>
          </div>
          {/* Email Status Message - Add transitions */}
          {emailStatus && (
            <p className={`mt-2 text-center text-sm transition-opacity duration-300 ease-in-out ${
              emailStatus.includes('Failed') || emailStatus.includes('required') || emailStatus.includes('valid')
                ? 'text-red-600 dark:text-red-400' 
                : emailStatus.includes('successfully') 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-gray-600 dark:text-gray-400' // For 'Sending...'
            }`}>
              {emailStatus}
            </p>
          )}
        </div>
      )}

      {/* Transcriptions Display */}
      {transcriptions.length > 0 && (
        <div className="w-full">
          <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200">Transcript</h3>
          <div className="space-y-3">
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
                  <div key={`${tIndex}-${sIndex}`} className={`p-4 rounded-lg border ${colorClass} transition-all duration-300 ease-in-out hover:border-opacity-80 hover:shadow-sm`}>
                    <div className="flex justify-between text-sm">
                      <div className="text-gray-500">{formatTime(startSec)} - {formatTime(endSec)}</div>
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