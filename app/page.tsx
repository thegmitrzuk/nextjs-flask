'use client'

import { useState, useCallback, useEffect, useRef } from 'react';
import AudioRecorder from './components/AudioRecorder'
import AgendaSaver from './components/AgendaSaver';

// Define types for agent responses
interface Explanation {
  term: string;
  explanation: string;
}

export default function Home() {
  // Lifted state
  const [agendaText, setAgendaText] = useState('');
  // State for agent outputs
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [prompts, setPrompts] = useState<string[]>([]);
  const [currentItem, setCurrentItem] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Debounce mechanism
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Callback for AudioRecorder to update transcript
  const handleTranscriptUpdate = useCallback((transcript: string) => {
    setCurrentTranscript(transcript);

    // Clear previous debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set a new debounce timer
    debounceTimeoutRef.current = setTimeout(() => {
      if (transcript.trim()) { // Only fetch if transcript is not empty
         fetchAgentData(transcript, agendaText);
      }
    }, 1500); // Debounce time: 1.5 seconds after last update

  }, [agendaText]); // Include agendaText dependency

  // Function to fetch data from all agent endpoints
  const fetchAgentData = async (transcript: string, agenda: string) => {
    setIsLoadingAgents(true);
    setAgentError(null);
    try {
      const bodyPayload = JSON.stringify({ transcript_text: transcript, agenda_text: agenda });

      // Fetch all agents in parallel
      const [promptsRes, currentItemRes, explanationsRes] = await Promise.all([
        fetch('/api/get-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript_text: transcript })
        }),
        fetch('/api/get-current-agenda', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyPayload
        }),
        fetch('/api/explain-concepts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript_text: transcript })
        })
      ]);

      // Process responses
      if (promptsRes.ok) {
        const data = await promptsRes.json();
        setPrompts(data.prompts || []);
      } else {
        console.error("Failed to fetch prompts:", await promptsRes.text());
        setPrompts([]); // Clear on error
      }

      if (currentItemRes.ok) {
        const data = await currentItemRes.json();
        setCurrentItem(data.current_item || 'Error loading item');
      } else {
         console.error("Failed to fetch current item:", await currentItemRes.text());
        setCurrentItem('Error loading item');
      }

      if (explanationsRes.ok) {
        const data = await explanationsRes.json();
        setExplanations(data.explanations || []);
      } else {
         console.error("Failed to fetch explanations:", await explanationsRes.text());
        setExplanations([]); // Clear on error
      }

    } catch (error: any) {
      console.error("Error fetching agent data:", error);
      setAgentError(`Failed to update agent data: ${error.message}`);
      // Clear states on general fetch error
      setPrompts([]);
      setCurrentItem(null);
      setExplanations([]);
    } finally {
      setIsLoadingAgents(false);
    }
  };

   // Cleanup debounce timer on unmount
   useEffect(() => {
     return () => {
       if (debounceTimeoutRef.current) {
         clearTimeout(debounceTimeoutRef.current);
       }
     };
   }, []);

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col items-center p-6 sm:p-8">
      <div className="max-w-3xl w-full flex flex-col items-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-8 sm:mb-12 text-center text-gray-800 dark:text-gray-100">
          Voice Transcription & <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500">AI Agents</span>
        </h1>

        {/* Pass state and callbacks down */}
        <AudioRecorder onTranscriptUpdate={handleTranscriptUpdate}>
          {/* Pass lifted state and setter down to AgendaSaver */}
          <AgendaSaver agendaText={agendaText} onAgendaChange={setAgendaText} />
        </AudioRecorder>

        {/* Agent Outputs Section */}
        {(prompts.length > 0 || currentItem || explanations.length > 0 || isLoadingAgents || agentError) && (
          <div className="mt-12 w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Current Agenda Item Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 md:col-span-1">
              <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Current Focus</h3>
              {isLoadingAgents && !currentItem ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">Loading...</p>
              ) : currentItem ? (
                  <p className="text-sm text-gray-800 dark:text-gray-100">{currentItem}</p>
              ) : (
                   <p className="text-sm text-gray-500 dark:text-gray-400 italic">Waiting for discussion...</p>
              )}
            </div>

            {/* Conversation Prompts Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 md:col-span-1">
              <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Conversation Prompts</h3>
               {isLoadingAgents && prompts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">Loading...</p>
              ) : prompts.length > 0 ? (
                <ul className="list-disc list-inside space-y-1">
                  {prompts.map((prompt, index) => (
                    <li key={index} className="text-sm text-gray-800 dark:text-gray-100">{prompt}</li>
                  ))}
                </ul>
              ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No prompts suggested yet.</p>
              )}
            </div>

            {/* Concept Explanations Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 md:col-span-1">
              <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Key Concepts</h3>
              {isLoadingAgents && explanations.length === 0 ? (
                   <p className="text-sm text-gray-500 dark:text-gray-400 italic">Loading...</p>
              ) : explanations.length > 0 ? (
                <ul className="space-y-2">
                  {explanations.map((exp, index) => (
                    <li key={index}>
                      <strong className="text-sm font-medium text-gray-800 dark:text-gray-100">{exp.term}:</strong>
                      <span className="ml-1 text-sm text-gray-600 dark:text-gray-300">{exp.explanation}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No complex concepts detected recently.</p>
              )}
            </div>

             {/* Agent Error Display */}
             {agentError && (
                <div className="md:col-span-3 mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 rounded-md">
                    <p className="text-sm text-red-700 dark:text-red-200">Agent Error: {agentError}</p>
                </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
