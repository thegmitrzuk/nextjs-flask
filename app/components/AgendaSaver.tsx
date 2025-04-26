'use client';

import { useState } from 'react';

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

  return (
    // Gradient border wrapper
    <div className="p-1 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg mt-10 w-full max-w-2xl">
      <div className="p-4 rounded-lg shadow-md bg-white dark:bg-gray-800">
          <label htmlFor="agenda-input" className="block mb-2 text-lg font-medium text-gray-900 dark:text-white">
            Agenda (Required before recording)
          </label>
          <textarea
            id="agenda-input"
            rows={10}
            value={agendaText}
            onChange={(e) => setAgendaText(e.target.value)}
            placeholder="Write down agenda here..."
            className="block w-full p-2.5 text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 mb-4"
          />
          <button
            onClick={handleSaveAgenda}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Save Agenda & Enable Recording
          </button>
          {statusMessage && (
            <p className={`mt-2 text-sm ${statusMessage.includes('Failed') || statusMessage.includes('empty') ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {statusMessage}
            </p>
          )}
      </div>
    </div>
  );
} 