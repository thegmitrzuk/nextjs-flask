'use client';

import { useState, ChangeEvent } from 'react';
import mammoth from 'mammoth';

interface AgendaSaverProps {
  onAgendaSubmit: () => void;
}

export default function AgendaSaver({ onAgendaSubmit }: AgendaSaverProps) {
  const [agendaText, setAgendaText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const handleSaveAgenda = async () => {
    // Prevent saving empty agenda
    if (!agendaText.trim()) {
        setStatusMessage('Agenda cannot be empty.');
        return;
    }
    setStatusMessage('Saving...');
    try {
      const response = await fetch('/api/save-agenda', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: agendaText }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setStatusMessage(result.message || 'Saved successfully!');
      // Clear the text area upon successful save
      setAgendaText('');
      // Notify parent component that agenda is submitted
      onAgendaSubmit();

    } catch (error) {
      console.error("Error saving agenda:", error);
      setStatusMessage('Failed to save agenda.');
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Only allow .txt, .docx and .pdf
    const allowedExtensions = /(\.txt|\.docx|\.pdf)$/i;
    const fileName = file.name.toLowerCase();

    if (!allowedExtensions.exec(fileName)) {
      // Update the validation message
      setStatusMessage('Invalid file type. Please upload a .txt, .docx or .pdf file.');
      event.target.value = ''; // Clear the file input
      return;
    }

    setAgendaText(''); // Clear previous content before loading new file
    setStatusMessage(''); // Clear previous status

    if (fileName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setAgendaText(text);
        setStatusMessage('Text file loaded successfully.');
      };
      reader.onerror = () => {
        console.error("Error reading file:", reader.error);
        setStatusMessage('Failed to read text file.');
      };
      reader.readAsText(file);
    } else if (fileName.endsWith('.docx')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (arrayBuffer) {
                try {
                    setStatusMessage('Processing .docx file...');
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    setAgendaText(result.value);
                    setStatusMessage('.docx file content loaded successfully.');
                } catch (error) {
                    console.error("Error processing .docx file:", error);
                    setStatusMessage('Failed to process .docx file.');
                    setAgendaText(''); // Clear text area on error
                }
            } else {
                setStatusMessage('Could not read .docx file.');
                setAgendaText('');
            }
        };
        reader.onerror = () => {
            console.error("Error reading file:", reader.error);
            setStatusMessage('Failed to read file for .docx processing.');
            setAgendaText('');
        };
        reader.readAsArrayBuffer(file);
    } else if (fileName.endsWith('.pdf')) {
        setStatusMessage('Uploading and processing PDF...');
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/extract-pdf-text', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' })); // Catch potential JSON parsing error
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            setAgendaText(result.text || ''); // Set text, default to empty string if missing
            setStatusMessage(result.message || 'PDF processed successfully.'); // Show message from API or default

        } catch (error) {
            console.error("Error processing PDF:", error);
            // Display a user-friendly error message
            setStatusMessage(`Failed to process PDF: ${error instanceof Error ? error.message : String(error)}`);
            setAgendaText(''); // Clear text area on error
        }
    }
  };


  return (
    // Gradient border wrapper
    <div className="p-1 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg mt-10 w-full max-w-2xl">
      <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
          <label htmlFor="agenda-input" className="block mb-2 text-lg font-medium text-gray-900 dark:text-white">
            Agenda
          </label>
          <textarea
            id="agenda-input"
            rows={10}
            value={agendaText}
            onChange={(e) => setAgendaText(e.target.value)}
            placeholder="Write down agenda here or upload a file (.txt, .docx, .pdf)..."
            className="block w-full p-2.5 text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4"
          />
          <div className="mt-4">
            <button
                onClick={handleSaveAgenda}
                className="w-full mb-2 px-4 py-2 text-white rounded-full bg-gradient-to-r from-blue-500 to-green-500 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
            >
                Submit
            </button>
            <label 
              htmlFor="file-upload" 
              className="block w-full text-center cursor-pointer px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-green-500 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-green-500 font-medium"
            >
                Upload file
            </label>
            <input
                id="file-upload"
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={handleFileChange}
                className="hidden"
            />
          </div>
          {statusMessage && (
            <p className={`mt-2 text-sm ${statusMessage.includes('Failed') || statusMessage.includes('empty') || statusMessage.includes('Invalid') ? 'text-red-600 dark:text-red-400' : 
                                        statusMessage.includes('successfully') ? 'text-green-600 dark:text-green-400' : 
                                        'text-gray-600 dark:text-gray-400'}`}>
                {statusMessage}
            </p>
          )}
      </div>
    </div>
  );
} 