from flask import Flask, request, jsonify
import os
from datetime import datetime
import requests
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

ELEVENLABS_API_KEY = os.getenv('ELEVENLABS_API_KEY')
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/speech-to-text"

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