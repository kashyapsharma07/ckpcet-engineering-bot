import ssl
ssl._create_default_https_context = ssl._create_unverified_context

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import os
import json
import uuid
import time
import urllib.request
import urllib.parse
from config import Config
from utils import log_query
from rag_engine import RAGEngine

print("=" * 50)
print("🚀 Starting CKPCET Engineering Chatbot...")
print("=" * 50)

# Point Flask to React's build output
app = Flask(
    __name__,
    static_folder="../frontend/dist",  # React build output
    static_url_path=""                 # Serve from root /
)

CORS(app)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

os.makedirs("logs", exist_ok=True)

print("🔄 Initializing RAG Engine...")
rag_engine = RAGEngine()
print("✅ RAG Engine Ready!")
print("=" * 50)


# ── Rate Limiting Middleware (30 req/min per IP) ──────────────────────────────
ip_request_timestamps = {}

@app.before_request
def limit_api_rate():
    if request.path.startswith("/api"):
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr) or "127.0.0.1"
        now = time.time()
        timestamps = ip_request_timestamps.get(client_ip, [])
        timestamps = [ts for ts in timestamps if now - ts < 60]
        if len(timestamps) >= 30:
            return jsonify({"error": "Rate limit exceeded. Please wait a minute before sending another request."}), 429
        timestamps.append(now)
        ip_request_timestamps[client_ip] = timestamps


# ── API Routes ────────────────────────────────────────────────────────────────

@app.route("/api", methods=["POST"])
def chatbot():
    data = request.get_json() or {}
    user_input = data.get("message", "").strip()
    session_id = data.get("session_id", str(uuid.uuid4()))
    stream_requested = data.get("stream", True)

    if not user_input:
        if not stream_requested:
            return jsonify({"response": "Please enter a message.", "session_id": session_id, "suggestions": []})
        def empty_gen():
            yield f"data: {json.dumps({'type': 'content', 'content': 'Please enter a message.'})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': []})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return Response(empty_gen(), mimetype="text/event-stream")

    if not stream_requested:
        result = rag_engine.generate_response(user_input, session_id, "en-IN")
        return jsonify({
            "response": result["response"],
            "suggestions": result.get("suggestions", []),
            "session_id": session_id,
        })

    return Response(
        rag_engine.generate_response_stream(user_input, session_id, "en-IN"),
        mimetype="text/event-stream"
    )



# ── STT: Groq Whisper Transcription (cross-browser) ──────────────────────────

@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    """Receive audio blob from any browser, transcribe via Groq Whisper.
    Works on Safari, Firefox, Chrome — any browser that supports MediaRecorder.
    """
    if not Config.GROQ_API_KEY:
        return jsonify({"error": "Groq API key not configured"}), 503

    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"error": "No audio file received"}), 400

    audio_bytes = audio_file.read()
    if len(audio_bytes) < 1000:  # less than 1 KB → silence / empty recording
        return jsonify({"transcript": ""})

    try:
        ctx = ssl._create_unverified_context()
        url = "https://api.groq.com/openai/v1/audio/transcriptions"

        # Build multipart/form-data manually
        boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
        filename = audio_file.filename or "recording.webm"

        body_parts = []
        # model field
        body_parts.append(
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"model\"\r\n\r\n"
            f"whisper-large-v3-turbo\r\n"
        )
        # language field
        body_parts.append(
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"language\"\r\n\r\n"
            f"en\r\n"
        )
        # audio file field
        body_parts.append(
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
            f"Content-Type: audio/webm\r\n\r\n"
        )

        body = b"".join(p.encode() for p in body_parts)
        body += audio_bytes
        body += f"\r\n--{boundary}--\r\n".encode()

        headers = {
            "Authorization": f"Bearer {Config.GROQ_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "CKPCETBot/1.0",
        }

        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            result = json.loads(resp.read().decode())
            transcript = result.get("text", "").strip()
            return jsonify({"transcript": transcript})

    except Exception as e:
        print(f"❌ Whisper transcription error: {e}")
        return jsonify({"error": str(e), "transcript": ""}), 500


@app.route("/api/feedback", methods=["POST"])
def save_feedback():
    try:
        data = request.json or {}
        stars = data.get("stars")
        met_goal = data.get("met_goal")
        comments = data.get("comments", "")
        
        feedback_dir = os.path.join(os.path.dirname(__file__), "logs")
        os.makedirs(feedback_dir, exist_ok=True)
        feedback_path = os.path.join(feedback_dir, "feedback.json")
        
        feedback_entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "stars": stars,
            "met_goal": met_goal,
            "comments": comments
        }
        
        entries = []
        if os.path.exists(feedback_path):
            try:
                with open(feedback_path, "r", encoding="utf-8") as f:
                    entries = json.load(f)
            except Exception:
                pass
                
        entries.append(feedback_entry)
        with open(feedback_path, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2)
            
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"❌ Error saving feedback: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/clear_history", methods=["POST"])
def clear_history():
    data = request.get_json() or {}
    session_id = data.get("session_id", "default")
    success = rag_engine.clear_history(session_id)
    return jsonify({
        "message": "Conversation history cleared" if success else "No history found",
        "session_id": session_id,
        "success": success,
    })


@app.route("/get_faqs", methods=["GET"])
def get_faqs():
    # Dynamically build FAQs from knowledge base
    faqs = []
    seen = set()
    for item in rag_engine.knowledge_base:
        q = item.get("question")
        a = item.get("answer", "")
        cat = item.get("category", "General")
        if q and q not in seen:
            seen.add(q)
            faqs.append({
                "question": q,
                "preview": a[:90] + "..." if len(a) > 90 else a,
                "stream": cat
            })
            if len(faqs) >= 6:
                break

    if not faqs:
        faqs = [
            {"question": "What courses are offered at CKPCET?", "preview": "CKPCET offers B.E. programs in Computer, IT, Civil, Mechanical...", "stream": "Academics"},
            {"question": "What are the engineering admission requirements?", "preview": "Pass 12th Science with 45% marks and GUJCET...", "stream": "Admissions"},
            {"question": "What is the tuition fee structure?", "preview": "Approximately ₹44,000 per semester...", "stream": "Fees"},
            {"question": "Does the college have hostel facilities?", "preview": "Yes, separate hostels for boys and girls...", "stream": "Facilities"},
            {"question": "How do I contact admissions?", "preview": "Phone: +91 78628-24298 or +91 63550 55839...", "stream": "Contact"},
        ]
    return jsonify({"faqs": faqs})


@app.route("/api/autocomplete", methods=["GET"])
def autocomplete():
    query = request.args.get("q", "").strip().lower()
    if not query or len(query) < 2:
        return jsonify({"suggestions": []})

    # Collect questions from engineering knowledge base
    questions = [item.get("question", "") for item in rag_engine.knowledge_base if item.get("question")]

    # Collect follow-up suggestions
    for category, suggs in rag_engine.follow_up_suggestions.items():
        questions.extend(suggs)

    unique_questions = sorted(list(set(questions)))

    # Filter by substring match
    matches = []
    for q in unique_questions:
        if query in q.lower():
            matches.append(q)
            if len(matches) >= 5:
                break

    return jsonify({"suggestions": matches})


@app.route("/health", methods=["GET"])
def health_check():
    active_model = Config.GROQ_MODEL if Config.ACTIVE_MODEL_PROVIDER == "groq" else Config.GEMINI_MODEL
    return jsonify({
        "status": "healthy",
        "model": active_model,
        "provider": Config.ACTIVE_MODEL_PROVIDER,
        "knowledge_base_entries": len(rag_engine.knowledge_base),
        "active_sessions": len(rag_engine.conversation_history),
        "cache_size": len(rag_engine.response_cache),
    })


# ── Serve React Frontend ──────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ── Security Headers ──────────────────────────────────────────────────────────

@app.after_request
def add_security_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
        "connect-src 'self' https://www.google.com https://*.googleapis.com; "
        "img-src 'self' data:; "
        "media-src 'self' blob:; "
    )
    return response


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5005))
    print(f"🌐 Starting Flask server on http://localhost:{port}")
    print("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)