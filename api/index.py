from flask import Flask, request, jsonify
import os
from datetime import datetime
import requests
import json
from dotenv import load_dotenv
from agents import Agent, Runner, FileSearchTool # Updated imports
import asyncio
import re
import logging # For better logging

load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=logging.INFO) # Setup basic logging

ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text"

# --- Agent Definitions (Consider moving outside endpoint if complex/reused) ---
# Define agents here so they are accessible by the summarize endpoint

# NOTE: Adjust instructions and potentially output_type based on desired behavior
summary_agent = Agent(
    name="Summarizer",
    instructions=("You are an assistant that summarizes conversation transcripts found via your tools using the provided filepath. "
                  "Provide a concise summary in 2-3 sentences. "
                  "Return only a JSON object with a single key 'summary' containing the summary text."),
    model="gpt-4o-mini", # Specify model if needed
    tools=[FileSearchTool()] # Add tool
)

agenda_agent = Agent(
    name="Agenda Agent",
    instructions=("Analyze the conversation transcript found via your tools using the provided filepath. "
                  "Raise any issue with the agenda of the meeting, either if the participants are not following the agenda or if the meeting is running behind agenda schedule. "
                  "Be polite and professional, suggest moving on to the next topic if needed. Return your findings as plain text."),
    model="gpt-4o-mini",
    tools=[FileSearchTool()]
)

question_agent = Agent(
    name="Question Agent",
    instructions=("Analyze the conversation transcript found via your tools using the provided filepath. "
                  "Ask clarifying questions relevant to the content if appropriate. Be polite and professional, and ask one question at a time. "
                  "Make sure to only ask relevant questions. Return your question as plain text."),
    model="gpt-4o-mini",
    tools=[FileSearchTool()]
)

triage_agent = Agent(
    name="Triage Agent",
    instructions=("Given a filepath to a conversation transcript, analyze its content using your tools. "
                  "Your primary goal is to determine the most appropriate next step. "
                  "1. If the conversation seems complete and a summary is needed, handoff to the Summarizer agent. "
                  "2. If there seems to be an issue with the meeting agenda (topic drift, running late), handoff to the Agenda Agent. "
                  "3. If the conversation content is unclear or warrants a clarifying question, handoff to the Question Agent. "
                  "Only handoff to one agent. If summarizing, ensure the final output is the JSON from the Summarizer."),
    handoffs=[summary_agent, agenda_agent, question_agent], # Correctly reference defined agents
    model="gpt-4o-mini",
    tools=[FileSearchTool()]
)


# --- Flask Routes ---

@app.route("/api/python")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/api/add", methods=['POST'])
def add_numbers():
    data = request.get_json()
    num1 = float(data.get('num1', 0))
    num2 = float(data.get('num2', 0))
    result = num1 + num2            
    return jsonify({"result": result})

@app.route("/api/save-audio", methods=['POST'])
def save_audio():
    if not ELEVENLABS_API_KEY:
        app.logger.error("ElevenLabs API Key not configured.")
        return jsonify({"error": "Server configuration error: Missing API Key"}), 500

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    duration = request.form.get('duration', '0')

    # Define paths
    recordings_dir = os.path.join(os.path.dirname(__file__), 'recordings')
    transcripts_dir = os.path.join(os.path.dirname(__file__), 'transcripts') # <-- Define transcript dir
    os.makedirs(recordings_dir, exist_ok=True)
    os.makedirs(transcripts_dir, exist_ok=True) # <-- Create transcript dir

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    base_filename = f"transcript_{timestamp}" # Base name for audio and text
    audio_filename = f"recording_{timestamp}_{duration}s.webm"
    audio_filepath = os.path.join(recordings_dir, audio_filename)
    transcript_filename = f"{base_filename}.txt" # <-- Transcript filename
    transcript_filepath = os.path.join(transcripts_dir, transcript_filename) # <-- Full transcript path

    # Save the audio file
    try:
        audio_file.save(audio_filepath)
        app.logger.info(f"Audio file saved to {audio_filepath}")
    except Exception as e:
        app.logger.error(f"Error saving audio file: {e}")
        # Clean up potentially partially saved file? Maybe not necessary.
        return jsonify({"error": f"Server error saving audio file: {e}"}), 500

    # Send to ElevenLabs for transcription
    transcript_text = None # Initialize
    try:
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        with open(audio_filepath, 'rb') as f:
            files_payload = {
                'file': (audio_filename, f, 'audio/webm'),
                'model_id': (None, 'scribe_v1'),
                'diarize': (None, 'true')
            }
            response = requests.post(
                ELEVENLABS_API_URL,
                headers=headers,
                files=files_payload,
                timeout=60
            )
        response.raise_for_status()
        transcription_data = response.json()

        # --- Extract and Save Transcript Text ---
        # Adjust based on actual ElevenLabs response structure
        # Simple example: assumes a top-level 'text' key or joining segments
        if 'text' in transcription_data:
             transcript_text = transcription_data['text']
        elif isinstance(transcription_data.get('segments'), list): # Example if diarized
             transcript_text = "\\n".join([f"Speaker {seg.get('speaker', 'Unknown')}: {seg.get('text', '')}" for seg in transcription_data['segments']])
        else:
             app.logger.warning("Could not determine transcript text structure from ElevenLabs response.")
             transcript_text = json.dumps(transcription_data) # Save raw JSON as fallback

        if transcript_text:
            try:
                with open(transcript_filepath, 'w', encoding='utf-8') as tf:
                    tf.write(transcript_text)
                app.logger.info(f"Transcript text saved to {transcript_filepath}")
            except Exception as e:
                app.logger.error(f"Error saving transcript file: {e}")
                # Decide if this is critical. Maybe return success but log error?
                # For now, let's return an error if we can't save the transcript needed later.
                return jsonify({
                    "message": "Audio transcribed but failed to save transcript text",
                    "audio_filename": audio_filename,
                    "error": f"Server error saving transcript file: {e}"
                }), 500
        # --- End Extract and Save ---

        app.logger.info("Transcription successful.")
        # Return the path to the saved transcript file
        return jsonify({
            "message": "Audio saved and transcribed successfully",
            "audio_filename": audio_filename,
            "transcript_filepath": transcript_filepath, # <-- Return the path
            # Optionally return raw transcription_data too if needed by frontend
            # "transcription_raw": transcription_data
        })

    except requests.exceptions.RequestException as e:
        app.logger.error(f"ElevenLabs API request failed: {e}")
        error_detail = str(e)
        # ... (rest of your existing error parsing logic) ...
        if e.response is not None:
            try:
                response_data = e.response.json()
                if isinstance(response_data, dict) and 'detail' in response_data:
                    detail_data = response_data['detail']
                    if isinstance(detail_data, dict) and 'message' in detail_data:
                        error_detail = detail_data['message']
                    elif isinstance(detail_data, str):
                        error_detail = detail_data
                    else:
                        error_detail = json.dumps(response_data)
                else:
                    error_detail = json.dumps(response_data)
            except json.JSONDecodeError:
                error_detail = e.response.text[:500]
            except Exception as parse_exc:
                app.logger.error(f"Error parsing ElevenLabs error response: {parse_exc}")
                error_detail = f"(Failed to parse error response: {e.response.text[:200]})"

        return jsonify({
            "message": "Audio saved but transcription failed",
            "audio_filename": audio_filename, # Use the correct variable name
            "error": f"API Error: {error_detail}"
        }), 500

    except Exception as e:
        app.logger.error(f"Unexpected error during transcription: {e}")
        return jsonify({
            "message": "Audio saved but transcription failed",
            "audio_filename": audio_filename, # Use the correct variable name
            "error": f"Unexpected server error during transcription: {e}"
        }), 500


@app.route("/api/summarize", methods=["POST"])
def summarize_conversation():
    data = request.get_json(silent=True) or {}
    # --- Expect filepath instead of transcript list ---
    transcript_filepath = data.get('transcript_filepath')
    if not transcript_filepath or not isinstance(transcript_filepath, str):
        return jsonify({"error": "No transcript_filepath provided or invalid format"}), 400

    # --- Check if file exists (optional but good practice) ---
    if not os.path.exists(transcript_filepath):
         app.logger.error(f"Transcript file not found: {transcript_filepath}")
         return jsonify({"error": f"Transcript file not found on server: {os.path.basename(transcript_filepath)}"}), 404

    # --- Run the Triage Agent ---
    try:
        app.logger.info(f"Running triage agent for transcript: {transcript_filepath}")
        # Ensure a new event loop for this thread if needed (run_sync might handle this)
        # loop = asyncio.new_event_loop()
        # asyncio.set_event_loop(loop)

        # Run the triage agent, passing the filepath as input
        result = Runner.run_sync(triage_agent, transcript_filepath)

        # loop.close() # Close loop if manually created

        app.logger.info(f"Triage agent finished. Final output type: {type(result.final_output)}")

        # The final output could be from any of the agents.
        # If it's from the Summarizer, it should be JSON. Otherwise, plain text.
        raw_output = result.final_output

        # Attempt to parse JSON (specifically for the Summarizer case)
        try:
            # Clean potential markdown fences just in case
            summary_output_cleaned = re.sub(r'^```(?:json)?\\s*', '', str(raw_output).strip())
            summary_output_cleaned = re.sub(r'\\s*```$', '', summary_output_cleaned)
            final_data = json.loads(summary_output_cleaned)
            # If successful, assume it's the summary structure
            if 'summary' in final_data:
                 response_data = {"summary": final_data['summary']}
            else: # Got JSON, but not the expected summary format
                 response_data = {"result": final_data} # Return the JSON as is
        except (json.JSONDecodeError, TypeError):
            # If not JSON, treat it as plain text output from Agenda or Question agent
            response_data = {"result": str(raw_output)} # Ensure it's a string

        return jsonify(response_data)

    except Exception as e:
        app.logger.error(f"Agent processing failed: {e}")
        # Add more specific error logging if possible (e.g., traceback)
        import traceback
        app.logger.error(traceback.format_exc())
        return jsonify({"error": f"Agent processing error: {e}"}), 500


# --- Removed the old agent definitions and main() from inside summarize_conversation ---

# --- If running standalone (for testing, not typical for Vercel) ---
# if __name__ == '__main__':
#     app.run(debug=True, port=5328) # Example for local testing
# Removed incorrect main/handoff call
#Removed Agent definitions from inside summarize()
#Moved agent definitions to top level
#Added FileSearchTool to all relevant agents
#Modified /api/save-audio to save transcript text and return filepath
#Modified /api/summarize to accept filepath, run triage_agent, and handle output

    
    
