import re
import logging
from datetime import datetime
import hashlib
import os

# Setup logging — resolve path relative to this file
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_log_dir = os.path.join(_backend_dir, "logs")
os.makedirs(_log_dir, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler(os.path.join(_log_dir, "queries.log")), logging.StreamHandler()],
)


def is_greeting(text):
    """Check if message is a greeting"""
    greetings = [
        r"^(namaste|namaskar|hello|hey|hi|pranam|नमस्ते|नमस्कार)$",
        r"^(kem cho|kese ho|kaise ho|कैसे हो|કેમ છો)$",
        r"^(hi|hello|hey|namaste|नमस्ते)[\s!.]*$",
    ]
    text_lower = text.lower().strip()
    return any(re.search(pattern, text_lower) for pattern in greetings)


def is_farewell(text):
    """Check if message is a farewell"""
    farewells = [
        r"^(bye|goodbye|see you|take care|thanks|thank you|shukriya|dhanyawad|aabhar|शुक्रिया|धन्यवाद|આભાર)[\s!.]*$",
    ]
    text_lower = text.lower().strip()
    return any(re.search(pattern, text_lower) for pattern in farewells)


def generate_cache_key(text):
    """Generate cache key for a query"""
    return hashlib.md5(text.lower().strip().encode()).hexdigest()


def clean_response(response):
    """Clean up response formatting and strip repetitive filler prefixes."""
    response = re.sub(r"\n{3,}", "\n\n", response).strip()
    response = re.sub(r"^(certainly|of course|sure|sure thing|absolutely|glad to help|glad to assist)[!.,\s]*", "", response, flags=re.IGNORECASE).strip()
    if response and response[0].islower():
        response = response[0].upper() + response[1:]
    return response




def log_query(user_query, response, session_id, retrieval_time, generation_time):
    """Log user queries for analytics"""
    logging.info(
        f"Session: {session_id} | "
        f"Query: {user_query[:100]} | "
        f"Retrieval: {retrieval_time:.2f}s | "
        f"Generation: {generation_time:.2f}s"
    )


def small_talk_response(text, target_lang="English"):
    """Detect casual / off-topic messages and return a friendly canned reply.

    Returns a response string if the message is small-talk, or None if it
    should be processed by the RAG pipeline.
    """
    t = text.lower().strip()

    # ── How are you / how's it going ────────────────────────────────────────
    # Use simpler patterns for non-English to avoid \b issues
    if re.search(r"\b(how are you|how('| a)re you doing|how('| i)s it going|what('| i)s up|how do you do|sup)\b", t) or \
       re.search(r"(kaise ho|kese ho|kem cho|कैसे हो|કેમ છો)(\s|$)", t):
        responses = {
            "English": "I'm doing great, thank you for asking! 😊\n\nI'm the CKPCET Assistant — here to help you with admissions, fees, courses, placements, and campus life.",
            "Hindi": "मैं बहुत अच्छा हूँ, पूछने के लिए धन्यवाद! 😊\n\nमैं CKPCET असिस्टेंट हूँ — प्रवेश, शुल्क, पाठ्यक्रम, प्लेसमेंट और कैंपस जीवन में आपकी सहायता के लिए यहाँ हूँ।",
            "Gujarati": "હું મજામાં છું, પૂછવા બદલ આભાર! 😊\n\nહું CKPCET આસિસ્ટન્ટ છું — પ્રવેશ, ફી, અભ્યાસક્રમો, પ્લેસમેન્ટ અને કેમ્પસ લાઇફમાં તમારી મદદ કરવા માટે અહીં છું."
        }
        return responses.get(target_lang, responses["English"])

    # ── Identity / name ─────────────────────────────────────────────────────
    if re.search(r"\b(what('| i)s your name|who are you|who made you|what are you|tell me about yourself)\b", t):
        responses = {
            "English": "I'm CKPCET Bot 🤖 — the official virtual assistant for C. K. Pithawala College of Engineering & Technology, Surat.\n\nI can help you with information about admissions, courses, fees, placements, hostel, campus facilities, and more!",
            "Hindi": "मैं CKPCET बॉट हूँ 🤖 — सी. के. पीठावाला कॉलेज ऑफ इंजीनियरिंग एंड टेक्नोलॉजी, सूरत का आधिकारिक वर्चुअल असिस्टेंट।\n\nमैं प्रवेश, पाठ्यक्रम, शुल्क, प्लेसमेंट, हॉस्टल, कैंपस सुविधाओं और बहुत कुछ के बारे में जानकारी देने में आपकी मदद कर सकता हूँ!",
            "Gujarati": "હું CKPCET બોટ છું 🤖 — સી. કે. પીઠાવાલા કોલેજ ઓફ એન્જિનિયરિંગ એન્ડ ટેકનોલોજી, સુરતનો સત્તાવાર વર્ચ્યુઅલ આસિસ્ટન્ટ.\n\nહું તમને પ્રવેશ, અભ્યાસક્રમો, ફી, પ્લેસમેન્ટ, હોસ્ટેલ, કેમ્પસ સુવિધાઓ અને વધુ વિશેની માહિતીમાં મદદ કરી શકું છું!"
        }
        return responses.get(target_lang, responses["English"])

    # ── Compliments ─────────────────────────────────────────────────────────
    if re.search(r"\b(you('| a)re (great|awesome|cool|amazing|nice|good|smart|helpful))\b", t):
        responses = {
            "English": "Thank you so much! 😊 I'm glad I could help.\n\nFeel free to ask me anything else about CKPCET!",
            "Hindi": "आपका बहुत-बहुत धन्यवाद! 😊 मुझे खुशी है कि मैं मदद कर सका।\n\nCKPCET के बारे में कुछ भी पूछने के लिए स्वतंत्र महसूस करें!",
            "Gujarati": "ખૂબ ખૂબ આભાર! 😊 મને આનંદ છે કે હું મદદ કરી શક્યો.\n\nCKPCET વિશે બીજું કંઈપણ પૂછવા માટે નિઃસંકોચ!"
        }
        return responses.get(target_lang, responses["English"])

    # ── Jokes / fun ─────────────────────────────────────────────────────────
    if re.search(r"\b(tell me a joke|joke|funny|make me laugh|humor)\b", t):
        responses = {
            "English": "Why did the engineering student bring a ladder to class? 😄\n\nBecause they wanted to reach higher education!\n\nNow, how can I help you with CKPCET? 🎓",
            "Hindi": "इंजीनियरिंग छात्र कक्षा में सीढ़ी क्यों लाया? 😄\n\nक्योंकि वे उच्च शिक्षा (Higher Education) तक पहुँचना चाहते थे!\n\nअब, मैं CKPCET के बारे में आपकी क्या मदद कर सकता हूँ? 🎓",
            "Gujarati": "એન્જિનિયરિંગનો વિદ્યાર્થી ક્લાસમાં નિસરણી કેમ લાવ્યો? 😄\n\nકારણ કે તેઓ ઉચ્ચ શિક્ષણ (Higher Education) સુધી પહોંચવા માંગતા હતા!\n\nહવે, હું તમને CKPCET માં કેવી રીતે મદદ કરી શકું? 🎓"
        }
        return responses.get(target_lang, responses["English"])

    # ── Insults / abuse ─────────────────────────────────────────────────────
    if re.search(r"\b(stupid|dumb|idiot|useless|suck|hate you|worst|bad bot|shut up)\b", t):
        responses = {
            "English": "I'm sorry if I wasn't helpful. 😔\n\nI'm here to assist with CKPCET-related queries — admissions, fees, courses, placements, and facilities.",
            "Hindi": "मुझे खेद है कि मैं मददगार नहीं था। 😔\n\nमैं यहाँ CKPCET से संबंधित प्रश्नों — प्रवेश, शुल्क, पाठ्यक्रम, प्लेसमेंट और सुविधाओं में सहायता के लिए हूँ।",
            "Gujarati": "હું દિલગીર છું જો હું મદદરૂપ ન હતો. 😔\n\nહું અહીં CKPCET સંબંધિત પ્રશ્નો — પ્રવેશ, ફી, અભ્યાસક્રમો, પ્લેસમેન્ટ અને સુવિધાઓમાં મદદ કરવા માટે છું."
        }
        return responses.get(target_lang, responses["English"])

    # ── Gratitude (short) ───────────────────────────────────────────────────
    if re.search(r"^(thanks?|thank you|thx|ty|ok thanks?|okay thanks?)[\s!.]*$", t):
        responses = {
            "English": "You're welcome! 😊 Feel free to ask if you have more questions about CKPCET.",
            "Hindi": "आपका स्वागत है! 😊 यदि आपके पास CKPCET के बारे में और प्रश्न हैं तो बेझिझक पूछें।",
            "Gujarati": "તમારું સ્વાગત છે! 😊 જો તમને CKPCET વિશે વધુ પ્રશ્નો હોય તો નિઃસંકોચ પૂછો."
        }
        return responses.get(target_lang, responses["English"])

    # ── Yes / No / Ok (very short, no context) ──────────────────────────────
    if re.search(r"^(ok|okay|yes|no|yep|nope|sure|alright|fine|hmm|hm|k|ya|yea|yeah)[\s!.]*$", t):
        responses = {
            "English": "Got it! 👍 If you have any questions about CKPCET — admissions, courses, fees, placements — just ask!",
            "Hindi": "समझ गया! 👍 यदि आपके पास CKPCET के बारे में कोई प्रश्न हैं — प्रवेश, पाठ्यक्रम, शुल्क, प्लेसमेंट — तो बस पूछें!",
            "Gujarati": "સમજાઈ ગયું! 👍 જો તમારી પાસે CKPCET વિશે કોઈ પ્રશ્નો હોય — પ્રવેશ, અભ્યાસક્રમો, ફી, પ્લેસમેન્ટ — તો બસ પૂછો!"
        }
        return responses.get(target_lang, responses["English"])

    # ── Completely off-topic (very short gibberish or single characters) ────
    if len(t) <= 2 and not re.search(r"\b(ec|it)\b", t):
        responses = {
            "English": "I didn't quite catch that. 🤔\n\nTry asking something like:\n• What courses does CKPCET offer?\n• What is the fee structure?\n• How is the placement record?",
            "Hindi": "मैं समझ नहीं पाया। 🤔\n\nऐसा कुछ पूछने का प्रयास करें:\n• CKPCET कौन से पाठ्यक्रम प्रदान करता है?\n• शुल्क संरचना क्या है?\n• प्लेसमेंट रिकॉर्ड कैसा है?",
            "Gujarati": "મને બરાબર સમજાયું નહીં. 🤔\n\nઆના જેવું કંઈક પૂછવાનો પ્રયાસ કરો:\n• CKPCET કયા અભ્યાસક્રમો ઓફર કરે છે?\n• ફીનું માળખું શું છે?\n• પ્લેસમેન્ટ રેકોર્ડ કેવો છે?"
        }
        return responses.get(target_lang, responses["English"])

    # Not small-talk → let RAG handle it
    return None

