from flask import Flask, request, jsonify
import os
from datetime import datetime
import requests
import json
from dotenv import load_dotenv
from agents import Agent, Runner  # add at top with other imports
import asyncio  # added for event loop management
import re  # add with other imports
from pypdf import PdfReader # Import PdfReader from pypdf
import io # To handle file stream
# Email sending imports
import smtplib
import logging
from email.message import EmailMessage
# Consider adding a web search library if needed for Concept Explainer
# from duckduckgo_search import DDGS # Example library

load_dotenv()

app = Flask(__name__)

ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text"
# Add OPENAI_API_KEY check, as Agents SDK requires it
if not os.getenv('OPENAI_API_KEY'):
    app.logger.warning("OPENAI_API_KEY environment variable not set. Agents SDK may not function.")

# Configure logging for email sending
logging.basicConfig(level=logging.INFO)

# --- Email Sending Function ---
def send_email(recipient_email: str, subject: str, body: str) -> bool:
    """Sends an email using Gmail SMTP.

    Requires GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD environment variables.
    Uses an App Password for Gmail authentication.

    Args:
        recipient_email: The email address of the recipient.
        subject: The subject line of the email.
        body: The plain text body of the email.

    Returns:
        True if the email was sent successfully, False otherwise.
    """
    sender_email = os.getenv("GMAIL_SENDER_EMAIL")
    app_password = os.getenv("GMAIL_APP_PASSWORD") # Use an App Password

    if not sender_email or not app_password:
        logging.error("Gmail sender email or app password not found in environment variables (GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD).")
        return False

    msg = EmailMessage()
    msg["From"] = sender_email
    msg["To"] = recipient_email
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        # Connect to Gmail's SSL SMTP server
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(sender_email, app_password)
            smtp.send_message(msg)
            logging.info(f"Email sent successfully to {recipient_email}")
            return True
    except smtplib.SMTPAuthenticationError:
        logging.error("SMTP Authentication Error: Check sender email and app password.")
        return False
    except smtplib.SMTPException as e:
        logging.error(f"SMTP Error occurred: {e}")
        return False
    except Exception as e:
        logging.error(f"An unexpected error occurred while sending email: {e}")
        return False

# --- Utility Function for Running Agents ---
def run_agent_sync(agent, prompt):
    """Helper function to run an agent synchronously."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = Runner.run_sync(agent, prompt)
        loop.close()
        return result.final_output.strip()
    except Exception as e:
        app.logger.error(f"Error running agent {agent.name}: {e}")
        raise  # Re-raise the exception to be handled by the endpoint

@app.route("/api/save-agenda", methods=['POST'])
def save_agenda():
    data = request.get_json()
    text_content = data.get('text')

    if text_content is None:
        return jsonify({'error': 'No text content provided'}), 400

    # Ensure agenda.txt is saved relative to the api directory or a designated data directory
    file_path = os.path.join(os.path.dirname(__file__), 'agenda.txt')

    try:
        # First, ensure the directory has appropriate permissions
        api_dir = os.path.dirname(__file__)
        try:
            # Attempt to make directory writable by all
            os.chmod(api_dir, 0o777)  # Full permissions for directory
        except Exception as e:
            app.logger.warning(f"Unable to set directory permissions: {e}")
        
        # Write the file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        # Ensure the file is accessible by setting permissive permissions
        try:
            os.chmod(file_path, 0o666)  # Read/write for everyone
        except Exception as e:
            app.logger.warning(f"Unable to set file permissions: {e}")
            
        app.logger.info(f"Agenda saved to {file_path}")
        return jsonify({'message': 'Agenda saved successfully'}), 200
    except PermissionError as e:
        app.logger.error(f"Permission error writing to file {file_path}: {e}")
        return jsonify({'error': f'Permission denied when saving agenda. Please check file permissions.'}), 500
    except Exception as e:
        app.logger.error(f"Error writing to file {file_path}: {e}")
        return jsonify({'error': f'Failed to save agenda: {e}'}), 500

@app.route("/api/load-agenda", methods=['GET'])
def load_agenda():
    file_path = os.path.join(os.path.dirname(__file__), 'agenda.txt')
    
    try:
        # Check if the file exists
        if not os.path.exists(file_path):
            app.logger.info(f"Agenda file not found at {file_path}")
            return jsonify({'error': 'No saved agenda found'}), 404
            
        # Try to ensure the file is readable
        try:
            os.chmod(file_path, 0o666)  # Read/write for everyone
        except Exception as e:
            app.logger.warning(f"Unable to set file permissions: {e}")
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        app.logger.info(f"Agenda loaded from {file_path}")
        return jsonify({'text': content}), 200
    except PermissionError as e:
        app.logger.error(f"Permission error reading file {file_path}: {e}")
        return jsonify({'error': 'Permission denied when loading agenda. Please check file permissions.'}), 500
    except Exception as e:
        app.logger.error(f"Error reading file {file_path}: {e}")
        return jsonify({'error': f'Failed to load agenda: {e}'}), 500

@app.route("/api/extract-pdf-text", methods=['POST'])
def extract_pdf_text():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Invalid file type, only PDF allowed"}), 400

    try:
        # Read the file into memory
        pdf_file_stream = io.BytesIO(file.read())
        reader = PdfReader(pdf_file_stream)
        text = ""
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted: # Check if text was extracted
                text += extracted + "\n" # Add newline between pages

        if not text.strip(): # Check if extracted text is empty after stripping whitespace
             return jsonify({"text": "", "message": "PDF contained no extractable text."}), 200

        return jsonify({"text": text}), 200
    except Exception as e:
        app.logger.error(f"Error extracting text from PDF: {e}")
        return jsonify({"error": f"Failed to process PDF: {e}"}), 500

@app.route("/api/save-audio", methods=['POST'])
def save_audio():
    if not ELEVENLABS_API_KEY:
        app.logger.error("ElevenLabs API Key not configured.")
        return jsonify({"error": "Server configuration error: Missing API Key"}), 500
        
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    duration = request.form.get('duration', '0')
    
    # Define path within a try block to handle potential issues
    filepath = None
    try:
        recordings_dir = os.path.join(os.path.dirname(__file__), 'recordings')
        os.makedirs(recordings_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"recording_{timestamp}_{duration}s.webm"
        filepath = os.path.join(recordings_dir, filename)
        
        # Save the audio file
        audio_file.save(filepath)
        app.logger.info(f"Audio file saved to {filepath}")
        
    except OSError as e:
        app.logger.error(f"Error saving audio file: {e}")
        return jsonify({"error": f"Server error saving file: {e}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error saving file: {e}")
        return jsonify({"error": f"Unexpected server error saving file: {e}"}), 500

    # Send to ElevenLabs for transcription
    try:
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        
        with open(filepath, 'rb') as f:
            # Combine file and model_id into the files payload for multipart/form-data
            files_payload = {
                'file': (filename, f, 'audio/webm'),
                'model_id': (None, 'scribe_v1'),  # Use the valid 'scribe_v1' model
                'diarize': (None, 'true')        # Enable speaker diarization
            }
            response = requests.post(
                ELEVENLABS_API_URL,
                headers=headers,
                files=files_payload, # Send the combined payload
                timeout=60
            )

        # Check response status *after* the request
        response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)
            
        transcription_data = response.json()
        app.logger.info("Transcription successful.")
        # Save transcript text to file
        transcripts_file = os.path.join(recordings_dir, "transcript.txt")
        try:
            # Create new file with permissive permissions if it doesn't exist
            if not os.path.exists(transcripts_file):
                with open(transcripts_file, "w", encoding="utf-8") as tf:
                    pass  # Just create the file
                try:
                    os.chmod(transcripts_file, 0o666)  # Read/write for everyone
                except Exception as e:
                    app.logger.warning(f"Unable to set transcript file permissions: {e}")
            
            # Append to the transcript file
            with open(transcripts_file, "a", encoding="utf-8") as tf:
                tf.write(transcription_data.get("text", "") + "\n\n")
                
        except PermissionError as e:
            app.logger.error(f"Permission error writing transcript file: {e}")
        except Exception as e:
            app.logger.error(f"Error writing transcript file: {e}")
        return jsonify({
            "message": "Audio saved and transcribed successfully",
            "filename": filename,
            "transcription": transcription_data
        })
            
    except requests.exceptions.RequestException as e:
        app.logger.error(f"ElevenLabs API request failed: {e}")
        error_detail = str(e) # Default error message
        # Try to parse more specific error details from the response body
        if e.response is not None:
            try:
                response_data = e.response.json()
                # Check if response_data is a dict and has expected keys
                if isinstance(response_data, dict) and 'detail' in response_data:
                    detail_data = response_data['detail']
                    # Check if detail_data is also a dict with 'message'
                    if isinstance(detail_data, dict) and 'message' in detail_data:
                        error_detail = detail_data['message']
                    # Handle cases where detail might be a string directly
                    elif isinstance(detail_data, str):
                        error_detail = detail_data
                    else: # Fallback if structure is unexpected
                        error_detail = json.dumps(response_data) # Show raw JSON
                else:
                    # If not the expected dict structure, show raw JSON
                    error_detail = json.dumps(response_data)
            except json.JSONDecodeError:
                # If response is not JSON, use raw text
                error_detail = e.response.text[:500] # Limit length
            except Exception as parse_exc: # Catch any other parsing errors
                app.logger.error(f"Error parsing ElevenLabs error response: {parse_exc}")
                error_detail = f"(Failed to parse error response: {e.response.text[:200]})"
                
        return jsonify({
            "message": "Audio saved but transcription failed",
            "filename": filename,
            "error": f"API Error: {error_detail}"
        }), 500 # Return 500 for server-side API issues
        
    except Exception as e:
        app.logger.error(f"Unexpected error during transcription: {e}")
        return jsonify({
            "message": "Audio saved but transcription failed",
            "filename": filename,
            "error": f"Unexpected server error during transcription: {e}"
        }), 500

@app.route("/api/summarize", methods=["POST"])
def summarize_conversation():
    data = request.get_json()
    if not data or 'transcript_text' not in data:
        return jsonify({"error": "Missing 'transcript_text' in request body"}), 400
    
    combined_text = data['transcript_text']

    if not combined_text:
         return jsonify({"summary": "No text provided to summarize."}) # Handle empty transcript


    # Create summarization agent
    agent = Agent(
        name="Summarizer",
        model="gpt-4.1", # Specify the model
        instructions=("You are an assistant that summarizes conversation transcripts. "
                      "Pay close attention to the provided transcript. "
                      "Provide a concise summary focusing on key topics and decisions made. "
                      "Return ONLY a JSON object with a single key 'summary'. Example: {\"summary\": \"Discussion focused on project timelines...\"}"),
    )
    try:
        raw_output = run_agent_sync(agent, combined_text)
        # Remove markdown code fences (```json ... ```) if present
        summary_output = re.sub(r'^```(?:json)?\s*', '', raw_output, flags=re.IGNORECASE)
        summary_output = re.sub(r'\s*```$', '', summary_output)
        
        # Attempt to parse JSON, fallback to raw output
        try:
            summary_json = json.loads(summary_output)
            summary_text = summary_json.get('summary', summary_output) # Use raw if key missing
        except json.JSONDecodeError:
             # If it's not valid JSON but looks like a summary, use it directly
             # Check if it seems like a reasonable summary (e.g., doesn't start with error messages)
             if len(summary_output) > 10 and not summary_output.lower().startswith("error"):
                 summary_text = summary_output
             else:
                 app.logger.warning(f"Summarizer returned non-JSON and non-summary output: {summary_output}")
                 # Fallback to a generic message or the raw output depending on desired behavior
                 summary_text = "Could not extract summary." # Or summary_output

        return jsonify({"summary": summary_text})
    except Exception as e:
        app.logger.error(f"Summarization failed: {e}")
        # Provide a more specific error message if possible
        return jsonify({"error": f"Summarization error: {str(e)}"}), 500

@app.route("/api/get-prompts", methods=["POST"])
def get_prompts():
    """Agent to generate conversation prompts based on the transcript."""
    data = request.get_json()
    if not data or 'transcript_text' not in data:
        return jsonify({"error": "Missing 'transcript_text' in request body"}), 400
    
    transcript_text = data['transcript_text']
    if not transcript_text.strip():
        return jsonify({"prompts": []}) # Return empty list if transcript is empty

    agent = Agent(
        name="ConversationPrompter",
        model="gpt-4.1", # Specify the model
        instructions=("Analyze the *latest* part of the conversation transcript. Pay close attention to the provided transcript. "
                      "Suggest 1-2 open-ended questions/prompts to keep the discussion flowing or explore related topics. "
                      "Focus on relevance to recent exchanges. "
                      "Return ONLY a JSON object: {\"prompts\": [\"prompt1\", \"prompt2\"]}. If no prompts are suitable, return {\"prompts\": []}."),
    )
    try:
        raw_output = run_agent_sync(agent, f"Current Transcript:\n{transcript_text}")
        prompts_output = re.sub(r'^```(?:json)?\s*', '', raw_output, flags=re.IGNORECASE)
        prompts_output = re.sub(r'\s*```$', '', prompts_output)

        try:
            prompts_json = json.loads(prompts_output)
            prompts_list = prompts_json.get('prompts', [])
            if not isinstance(prompts_list, list): # Ensure it's a list
                prompts_list = []
        except json.JSONDecodeError:
            app.logger.warning(f"Prompter returned non-JSON output: {prompts_output}")
            prompts_list = [] # Fallback to empty list

        return jsonify({"prompts": prompts_list})
    except Exception as e:
        app.logger.error(f"Prompt generation failed: {e}")
        return jsonify({"error": f"Prompt generation error: {str(e)}"}), 500

@app.route("/api/get-current-agenda", methods=["POST"])
def get_current_agenda():
    """Agent to determine the current agenda item based on transcript and agenda."""
    data = request.get_json()
    if not data or 'transcript_text' not in data or 'agenda_text' not in data:
        return jsonify({"error": "Missing 'transcript_text' or 'agenda_text' in request body"}), 400

    transcript_text = data['transcript_text']
    agenda_text = data['agenda_text']

    if not transcript_text.strip() or not agenda_text.strip():
        # If either is empty, we likely can't determine the item
        return jsonify({"current_item": "Agenda or transcript not available."})

    agent = Agent(
        name="AgendaTracker",
        model="gpt-4.1", # Specify the model
        instructions=("Compare the meeting agenda with the *latest* part of the transcript. Pay close attention to the provided transcript and agenda. "
                      "Identify which specific agenda item is most likely being discussed *right now*. "
                      "If the discussion is between items or off-topic, state that clearly. "
                      "Return ONLY a JSON object: {\"current_item\": \"description of current focus\"}. "
                      "The description should be the agenda item text, or a status like 'Off-topic discussion', 'Transitioning between items', etc."),
    )
    try:
        prompt = f"AGENDA:\n{agenda_text}\n\nTRANSCRIPT (latest part is most important):\n{transcript_text}"
        raw_output = run_agent_sync(agent, prompt)
        agenda_output = re.sub(r'^```(?:json)?\s*', '', raw_output, flags=re.IGNORECASE)
        agenda_output = re.sub(r'\s*```$', '', agenda_output)

        try:
            agenda_json = json.loads(agenda_output)
            current_item = agenda_json.get('current_item', "Could not determine current item.")
        except json.JSONDecodeError:
            app.logger.warning(f"AgendaTracker returned non-JSON output: {agenda_output}")
            # Use the raw output if it seems descriptive
            current_item = agenda_output if len(agenda_output) > 5 else "Could not determine current item."


        return jsonify({"current_item": current_item})
    except Exception as e:
        app.logger.error(f"Agenda tracking failed: {e}")
        return jsonify({"error": f"Agenda tracking error: {str(e)}"}), 500

@app.route("/api/explain-concepts", methods=["POST"])
def explain_concepts():
    """Agent to identify complex concepts and (eventually) look them up."""
    data = request.get_json()
    if not data or 'transcript_text' not in data:
        return jsonify({"error": "Missing 'transcript_text' in request body"}), 400

    transcript_text = data['transcript_text']
    if not transcript_text.strip():
        return jsonify({"explanations": []}) # Return empty list if transcript is empty

    # TODO: Integrate a real web search tool here.
    # Example using a placeholder function tool:
    # def web_search_tool(query: str) -> str:
    #     """Searches the web for a given query and returns a summary."""
    #     # Replace with actual web search implementation (e.g., using requests, BeautifulSoup, search API)
    #     print(f"Simulating web search for: {query}")
    #     if "gradient descent" in query.lower():
    #         return "Gradient descent is an optimization algorithm used to minimize a function by iteratively moving in the direction of steepest descent."
    #     elif "react hooks" in query.lower():
    #         return "React Hooks are functions that let you 'hook into' React state and lifecycle features from function components."
    #     else:
    #         return f"No specific information found for '{query}' in this simulation."

    agent = Agent(
        name="ConceptExplainer",
        model="gpt-4.1", # Specify the model
        instructions=("Read the *latest* part of the conversation transcript. Pay close attention to the provided transcript. "
                      "Identify 1-2 potentially complex technical terms, jargon, or concepts mentioned *recently*. "
                      "Provide a brief (1-sentence) definition/explanation for each. "
                      # "Use the web_search_tool if needed." # Uncomment when tool is added
                      "Return ONLY a JSON object: {\"explanations\": [{\"term\": \"Term1\", \"explanation\": \"Explanation1\"}, ...]}. "
                      "If no complex concepts are found, return {\"explanations\": []}."),
        # tools=[] # Add actual tool function here when implemented
    )
    try:
        prompt = f"Analyze the following transcript for complex concepts:\n{transcript_text}"
        raw_output = run_agent_sync(agent, prompt)
        concepts_output = re.sub(r'^```(?:json)?\s*', '', raw_output, flags=re.IGNORECASE)
        concepts_output = re.sub(r'\s*```$', '', concepts_output)

        try:
            concepts_json = json.loads(concepts_output)
            explanations = concepts_json.get('explanations', [])
            if not isinstance(explanations, list): # Ensure it's a list
                 explanations = []
            # Further validation: ensure list contains dicts with 'term' and 'explanation'
            explanations = [item for item in explanations if isinstance(item, dict) and 'term' in item and 'explanation' in item]

        except json.JSONDecodeError:
            app.logger.warning(f"ConceptExplainer returned non-JSON output: {concepts_output}")
            explanations = [] # Fallback to empty list

        return jsonify({"explanations": explanations})
    except Exception as e:
        app.logger.error(f"Concept explanation failed: {e}")
        return jsonify({"error": f"Concept explanation error: {str(e)}"}), 500

@app.route("/api/send-summary-email", methods=["POST"])
def send_summary_email():
    """Endpoint to send the generated summary via email."""
    data = request.get_json()
    recipient_email = data.get('recipient_email')
    summary_text = data.get('summary_text')

    if not recipient_email or not summary_text:
        return jsonify({"error": "Missing recipient email or summary text"}), 400

    # Basic email validation (optional but recommended)
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", recipient_email):
         return jsonify({"error": "Invalid email format"}), 400

    subject = "Meeting Summary"
    # You might want to format the body more nicely
    body = f"Here is the summary of the recent meeting:\n\n{summary_text}"

    success = send_email(recipient_email, subject, body)

    if success:
        return jsonify({"message": "Email sent successfully"}), 200
    else:
        # Check if the error is due to missing config to provide a better client message
        if not os.getenv("GMAIL_SENDER_EMAIL") or not os.getenv("GMAIL_APP_PASSWORD"):
             return jsonify({"error": "Email configuration missing on the server."}), 500
        return jsonify({"error": "Failed to send email. Check server logs."}), 500

@app.route("/api/clear-transcript", methods=["POST"])
def clear_transcript():
    """Clear the existing transcript file to start fresh"""
    try:
        transcripts_file = os.path.join(os.path.dirname(__file__), 'recordings', 'transcript.txt')
        
        # Ensure the recordings directory exists and has appropriate permissions
        recordings_dir = os.path.join(os.path.dirname(__file__), 'recordings')
        os.makedirs(recordings_dir, exist_ok=True)
        
        try:
            # Try to make the directory accessible
            os.chmod(recordings_dir, 0o777)
        except Exception as e:
            app.logger.warning(f"Unable to set directory permissions: {e}")
        
        if os.path.exists(transcripts_file):
            open(transcripts_file, 'w').close()  # Truncate file
            
            # Set permissive permissions on the file
            try:
                os.chmod(transcripts_file, 0o666)  # Read/write for everyone
            except Exception as e:
                app.logger.warning(f"Unable to set transcript file permissions: {e}")
                
            return jsonify({"message": "Transcript file cleared"}), 200
        return jsonify({"message": "No transcript file found"}), 200
    except PermissionError as e:
        app.logger.error(f"Permission error clearing transcript file: {e}")
        return jsonify({"error": f"Permission denied when clearing transcript: {e}"}), 500
    except Exception as e:
        app.logger.error(f"Error clearing transcript file: {e}")
        return jsonify({"error": f"Error clearing transcript: {e}"}), 500

if __name__ == "__main__":
    # Ensure this runs only locally, Vercel uses its own server mechanism
    app.run(debug=True) # Or configure host/port as needed