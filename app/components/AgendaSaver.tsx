'use client';

import { useState, ChangeEvent, useEffect, Dispatch, SetStateAction } from 'react';
import mammoth from 'mammoth';

// Define props for controlled component
interface AgendaSaverProps {
  agendaText: string;
  onAgendaChange: (text: string) => void;
  // Add other props if needed, e.g., to pass status up
}

export default function AgendaSaver({ agendaText, onAgendaChange }: AgendaSaverProps) {
  const [statusMessage, setStatusMessage] = useState('');
  // State to track if the user is currently editing the agenda
  const [isEditingAgenda, setIsEditingAgenda] = useState(true); 
  // State to track if an agenda file exists on the server
  const [agendaExistsOnServer, setAgendaExistsOnServer] = useState(false);

  // Check if an agenda file exists when the component mounts
  useEffect(() => {
    const checkAgendaExists = async () => {
      try {
        const response = await fetch('/api/load-agenda');
        setAgendaExistsOnServer(response.ok); // true if status 200-299
        if (response.ok) {
          // If it exists, maybe start in non-editing mode?
          // Let's stick to starting in edit mode as per initial request
          // const data = await response.json();
          // setAgendaText(data.text || '');
          // setIsEditingAgenda(false);
        }
      } catch (error) {
        console.error("Error checking for existing agenda:", error);
        setAgendaExistsOnServer(false);
      }
    };
    checkAgendaExists();
  }, []);

  const handleSaveAgenda = async () => {
    if (!agendaText.trim()) {
        setStatusMessage('Agenda cannot be empty.');
        return;
    }
    setStatusMessage('Saving...');
    try {
      const response = await fetch('/api/save-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: agendaText }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const result = await response.json();
      setStatusMessage(''); // Set to empty string to clear any previous messages
      setIsEditingAgenda(false); // Switch to non-editing mode after save
      setAgendaExistsOnServer(true); // Mark that agenda now exists
    } catch (error) {
      console.error("Error saving agenda:", error);
      setStatusMessage('Failed to save agenda.');
      // Remain in editing mode on failure
    }
  };

  // Renamed from handleLoadAgenda -> handleEditAgenda
  const handleEditAgenda = async () => {
    setStatusMessage('Loading saved agenda...');
    try {
      const response = await fetch('/api/load-agenda');
      if (!response.ok) {
         // Handle case where file doesn't exist (e.g., 404)
         if(response.status === 404) {
            setStatusMessage('No saved agenda found. You can start typing a new one.');
            setAgendaExistsOnServer(false);
         } else {
            throw new Error(`HTTP error! status: ${response.status}`);
         }
      } else {
        const data = await response.json();
        onAgendaChange(data.text || ''); 
        setStatusMessage('Saved agenda loaded.');
        setAgendaExistsOnServer(true);
      }
      setIsEditingAgenda(true); // Switch to editing mode
    } catch (error) {
      console.error("Error loading agenda:", error);
      setStatusMessage('Failed to load saved agenda.');
      onAgendaChange(''); // Clear text on error
      setIsEditingAgenda(true); // Allow editing even on error
      setAgendaExistsOnServer(false); // Assume non-existent on error
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedExtensions = /(\.txt|\.docx|\.pdf)$/i;
    const fileName = file.name.toLowerCase();

    if (!allowedExtensions.exec(fileName)) {
      setStatusMessage('Invalid file type. Please upload a .txt, .docx or .pdf file.');
      event.target.value = ''; 
      return;
    }

    setStatusMessage('Processing file...'); 
    setIsEditingAgenda(true); // Ensure we are in editing mode when file is chosen
    setAgendaExistsOnServer(false); // Loading a file means it's not the *saved* server version

    try {
      if (fileName.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          onAgendaChange(text);
          setStatusMessage('Text file loaded successfully. Click Save Agenda.');
        };
        reader.onerror = () => { throw new Error('Failed to read text file.'); };
        reader.readAsText(file);
      } else if (fileName.endsWith('.docx')) {
          const reader = new FileReader();
          reader.onload = async (e) => {
              const arrayBuffer = e.target?.result as ArrayBuffer;
              if (!arrayBuffer) throw new Error('Could not read .docx file.');
              setStatusMessage('Processing .docx file...');
              const result = await mammoth.extractRawText({ arrayBuffer });
              onAgendaChange(result.value);
              setStatusMessage('.docx file content loaded successfully. Click Save Agenda.');
          };
          reader.onerror = () => { throw new Error('Failed to read file for .docx processing.'); };
          reader.readAsArrayBuffer(file);
      } else if (fileName.endsWith('.pdf')) {
          setStatusMessage('Uploading and processing PDF...');
          const formData = new FormData();
          formData.append('file', file);
          const response = await fetch('/api/extract-pdf-text', {
              method: 'POST',
              body: formData,
          });
          if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
              throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }
          const result = await response.json();
          onAgendaChange(result.text || '');
          setStatusMessage(result.message || 'PDF processed successfully. Click Save Agenda.');
      }
    } catch (error) {
        console.error("Error processing file:", error);
        setStatusMessage(`Failed to process file: ${error instanceof Error ? error.message : String(error)}`);
        onAgendaChange(''); // Clear text area on error
    } finally {
         event.target.value = ''; // Clear the file input
    }
  };


  return (
    // Conditionally render the outer frame ONLY when editing
    <> 
      {isEditingAgenda ? (
        // Frame shown only in editing mode - Add transition - Adjust margin
        <div className="p-1 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg mt-8 w-full max-w-2xl transition-all duration-300 ease-in-out">
          <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
            {/* Title shown only in editing mode */}
            <label htmlFor="agenda-input" className="block mb-2 text-lg font-medium text-gray-900 dark:text-white">
              Agenda
            </label>
            
            {/* Editing Mode UI (textarea, buttons) */}
            <textarea
              id="agenda-input"
              rows={10}
              value={agendaText}
              onChange={(e) => onAgendaChange(e.target.value)}
              placeholder="Write down agenda here or upload a file (.txt, .docx, .pdf)..."
              className="block w-full p-2.5 text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-3"
            />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Save Button - Add transitions */}
              <button
                  onClick={handleSaveAgenda}
                  className="sm:col-span-1 px-4 py-2 text-white rounded-full bg-gradient-to-r from-blue-500 to-green-500 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-all duration-200 ease-in-out active:scale-95"
              >
                  Save Agenda
              </button>
              {/* Upload File Button - Add transitions */}
              <label 
                htmlFor="file-upload" 
                className="sm:col-span-1 block w-full text-center cursor-pointer px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-green-500 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500 font-medium transition-all duration-200 ease-in-out active:scale-95"
              >
                  Upload File
              </label>
              <input
                  id="file-upload"
                  type="file"
                  accept=".txt,.docx,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
              />
            </div>

            {/* Status Message (inside frame when editing) - Add transitions - Adjust margin */}
            {statusMessage && (
              <p className={`mt-3 text-center text-sm transition-opacity duration-300 ease-in-out ${statusMessage.includes('Failed') || statusMessage.includes('empty') || statusMessage.includes('Invalid') || statusMessage.includes('No saved') ? 'text-red-600 dark:text-red-400' : 
                                          statusMessage.includes('successfully') || statusMessage.includes('loaded') ? 'text-green-600 dark:text-green-400' : 
                                          'text-gray-600 dark:text-gray-400'}`}>
                  {statusMessage}
              </p>
            )}
          </div>
        </div>
      ) : (
        // Submitted/View Mode UI (no frame, no title) - Adjust margin
        <div className="mt-8 w-full max-w-2xl flex flex-col items-center transition-all duration-300 ease-in-out">
           {/* Edit Button (styled like Upload button) - Add transitions */}
            <button
                onClick={handleEditAgenda}
                disabled={!agendaExistsOnServer} 
                // Apply styles similar to Upload File label
                className={`px-6 py-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-all duration-200 ease-in-out active:scale-95 ${!agendaExistsOnServer 
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                    : 'border border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-green-500 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500 font-medium focus:ring-blue-500'}`}
                title={!agendaExistsOnServer ? "No agenda saved yet" : "Edit the saved agenda"}
            >
                Edit Agenda
            </button>

            {/* Status Message (outside frame when not editing) - Add transitions - Adjust margin */}
            {statusMessage && (
              <p className={`mt-3 text-center text-sm transition-opacity duration-300 ease-in-out ${statusMessage.includes('Failed') || statusMessage.includes('empty') || statusMessage.includes('Invalid') || statusMessage.includes('No saved') ? 'text-red-600 dark:text-red-400' : 
                                          statusMessage.includes('successfully') || statusMessage.includes('loaded') ? 'text-green-600 dark:text-green-400' : 
                                          'text-gray-600 dark:text-gray-400'}`}>
                  {statusMessage}
              </p>
            )}
        </div>
      )}
    </> // End of conditional fragment
  );
} 