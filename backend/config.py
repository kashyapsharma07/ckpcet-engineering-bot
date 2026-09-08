import os
import time
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Load environment variables from .env file in the backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

class Config:
    # API Configuration
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")

    # Validate at least one API key is present
    if (not GEMINI_API_KEY or "your_" in GEMINI_API_KEY) and (not GROQ_API_KEY or "your_" in GROQ_API_KEY):
        raise ValueError(
            "❌ No valid API key found in backend/.env!\n"
            "Please set either GEMINI_API_KEY or GROQ_API_KEY."
        )

    # Model Configuration
    GEMINI_MODEL = "gemini-3.1-flash-lite"
    GROQ_MODEL = "qwen/qwen3.8-27b" # Qwen 3 model available on Groq
    
    # Active Model - Using Groq by default for faster, high-performance responses
    ACTIVE_MODEL_PROVIDER = "groq" 
    
    MAX_TOKENS = 2048
    TEMPERATURE = 0.2

    # Rate Limiting
    REQUEST_DELAY = 2
    MAX_REQUESTS_PER_MINUTE = 15
    MAX_REQUESTS_PER_DAY = 1500

    # RAG Configuration
    EMBEDDING_MODEL = 'paraphrase-multilingual-MiniLM-L12-v2'
    TOP_K_RETRIEVAL = 5
    SIMILARITY_THRESHOLD = 0.25
    MAX_HISTORY_LENGTH = 5
    SESSION_TIMEOUT = 3600

    # Dataset Configuration — resolve relative to this file so it works
    # regardless of what directory you run `python app.py` from.
    DATASET_PATH = os.path.join(os.path.dirname(__file__), 'dataset.json')

    # Logging
    LOG_FILE = 'logs/queries.log'
    ENABLE_LOGGING = True

    # Cache Configuration
    ENABLE_CACHE = True
    CACHE_TTL = 86400  # 24 Hours Cache TTL to prevent API cost sky-rocketing

    @staticmethod
    def apply_rate_limit():
        """Add delay between API requests"""
        time.sleep(Config.REQUEST_DELAY)