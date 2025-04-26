# Meeting Guru: Next.js & Flask AI Meeting Assistant

This project showcases Meeting Guru, a sophisticated, real-time meeting assistant application built with Next.js for the frontend and Flask for the backend. It leverages state-of-the-art AI capabilities, including real-time transcription via ElevenLabs and multi-agent analysis powered by the OpenAI Agents SDK, to provide intelligent insights during live conversations.

## Core Features

*   **Real-time Audio Transcription:** Captures audio via the browser and transcribes it in near real-time using the **ElevenLabs Scribe API**.
*   **Speaker Diarization:** Automatically identifies and differentiates between different speakers in the transcript.
*   **Multi-Agent AI Analysis (OpenAI Agents SDK):** Deploys multiple concurrent AI agents to process the live transcript and provide dynamic assistance:
    *   **Conversation Summarization:** Generates concise summaries of the ongoing discussion.
    *   **Dynamic Conversation Prompts:** Suggests relevant questions or discussion points based on the latest exchanges to keep the conversation flowing.
    *   **Agenda Item Tracking:** Compares the live transcript against a pre-loaded agenda to identify the current topic of discussion.
    *   **Key Concept Explanation:** Detects potentially complex terms or jargon and provides brief explanations (with planned integration for web search).
*   **Agenda Management:** Allows users to type, paste, or upload (`.txt`, `.docx`, `.pdf`) a meeting agenda.
*   **Automated Emailing of Summaries:** Enables sending the generated meeting summary directly to participants via email (using Gmail SMTP).
*   **Modern Web Interface:** A responsive and user-friendly interface built with Next.js, React, and Tailwind CSS.

## Technology Stack

*   **Frontend:**
    *   Next.js (React Framework)
    *   TypeScript
    *   Tailwind CSS
    *   Mammoth (for `.docx` parsing)
*   **Backend:**
    *   Flask (Python Web Framework)
    *   Python 3.x
*   **AI & External Services:**
    *   **ElevenLabs API (Scribe):** For transcription and diarization.
    *   **OpenAI API (via Agents SDK):** For powering the various analysis agents (Summarizer, Prompter, Agenda Tracker, Concept Explainer).
    *   **Gmail SMTP:** For sending email summaries.

## Key Integrations

*   **ElevenLabs Scribe:** Leveraged for its high accuracy in speech-to-text and its ability to perform speaker diarization, crucial for understanding multi-participant conversations.
*   **OpenAI Agents SDK:** This framework is central to the application's intelligence, allowing for the definition and concurrent execution of multiple specialized AI agents that react to the conversation flow in real-time.

## AI Agent Functionalities

The application utilizes the `openai-agents` Python SDK to manage the following AI-driven tasks:

1.  **Summarizer:** Takes the full transcript and generates a concise summary upon request.
2.  **Conversation Prompter:** Analyzes the *latest* part of the transcript to suggest relevant, open-ended questions or prompts.
3.  **Agenda Tracker:** Compares the provided agenda with the recent transcript content to determine the most likely agenda item currently being discussed.
4.  **Concept Explainer:** Identifies complex terms or jargon recently mentioned and provides brief definitions. (*Note: Currently uses LLM knowledge; integration with a live web search tool is planned.*)

## Setup and Installation

**Prerequisites:**

*   Node.js and npm (or pnpm/yarn)
*   Python 3.7+ and pip
*   Git

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Backend Setup:**
    *   Navigate to the `api` directory: `cd api`
    *   Create and activate a Python virtual environment:
        ```bash
        python -m venv venv
        # Windows
        .\venv\Scripts\activate
        # macOS/Linux
        source venv/bin/activate
        ```
    *   Install Python dependencies:
        ```bash
        pip install -r ../requirements.txt 
        ```
    *   Set up environment variables (see below).

3.  **Frontend Setup:**
    *   Navigate back to the root directory: `cd ..`
    *   Install Node.js dependencies:
        ```bash
        npm install 
        # or pnpm install / yarn install
        ```

## Environment Variables

Create a `.env` file in the *root* directory of the project (where `package.json` is) and add the following variables:

```plaintext
# For ElevenLabs Transcription API
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# For OpenAI Agents SDK (requires an OpenAI API Key)
OPENAI_API_KEY=your_openai_api_key

# For Sending Email via Gmail
GMAIL_SENDER_EMAIL=your_gmail_address@gmail.com
# IMPORTANT: Use a Gmail App Password, not your regular password!
# See: https://support.google.com/accounts/answer/185833?hl=en
GMAIL_APP_PASSWORD=your_gmail_app_password 
```

*   Replace the placeholder values with your actual keys and credentials.
*   **Gmail App Password:** You *must* generate an App Password for your Gmail account if you have 2-Step Verification enabled. Do not use your regular Gmail password here.

## Running the Application

1.  **Start the Backend (Flask) Server:**
    *   Make sure you are in the root directory and your Python virtual environment (`venv`) is activated.
    *   Run the Flask development server (it will typically run on port 5328 as configured in `api/index.py`):
        ```bash
        python api/index.py
        ```
    *   *(Alternative for Vercel development)*: If configured for Vercel, you might use `vercel dev` in the root directory, which should handle starting both frontend and backend based on `vercel.json`.

2.  **Start the Frontend (Next.js) Server:**
    *   Open a *new* terminal in the root directory.
    *   Run the Next.js development server (typically on port 3000):
        ```bash
        npm run dev
        # or pnpm dev / yarn dev
        ```

3.  **Access the Application:**
    *   Open your web browser and navigate to `http://localhost:3000` (or the port specified by Next.js).

## Deployment

This application appears configured for deployment on Vercel. The `vercel.json` file likely contains rewrite rules to route requests starting with `/api/` to the Flask backend function (`api/index.py`). Deploying involves connecting your Git repository to Vercel. Ensure all necessary environment variables are set in the Vercel project settings.

---

## Authors

* Patryk Gmitrzuk
* Yelyzaveta Dymchenko
* Piotr Biziel
* Antoni Borys

---

Enjoy your real-time, diarized speech-to-text application! Feel free to customize and extend. We welcome contributions. Happy coding!
