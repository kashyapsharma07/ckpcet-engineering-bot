import json
import numpy as np
import os
import time
import random
import uuid
import re
import urllib.request
import ssl
from config import Config
from utils import (
    is_greeting,
    is_farewell,
    small_talk_response,
    generate_cache_key,
    clean_response,
    log_query,
)


class LightweightEmbeddingModel:
    """Fast, zero-dependency TF-IDF + N-gram Semantic Vectorizer for RAG search."""
    def __init__(self):
        self.vocab = {}
        self.idf = None

    def _extract_ngrams(self, text):
        text = str(text).lower()
        words = re.findall(r'\w+', text)
        tokens = list(words)
        for i in range(len(words) - 1):
            tokens.append(f"{words[i]}_{words[i+1]}")
        clean_str = "".join(words)
        for i in range(len(clean_str) - 2):
            tokens.append(f"char:{clean_str[i:i+3]}")
        return tokens

    def fit(self, documents):
        doc_count = len(documents)
        df = {}
        for doc in documents:
            tokens = set(self._extract_ngrams(doc))
            for t in tokens:
                df[t] = df.get(t, 0) + 1

        self.vocab = {t: idx for idx, (t, freq) in enumerate(df.items()) if freq >= 1}
        vocab_size = len(self.vocab)
        self.idf = np.zeros(vocab_size)
        for t, idx in self.vocab.items():
            self.idf[idx] = math.log((doc_count + 1) / (df[t] + 1)) + 1.0

    def encode(self, texts, show_progress_bar=False):
        if not self.vocab:
            return np.zeros((len(texts), 1))
            
        vocab_size = len(self.vocab)
        vectors = np.zeros((len(texts), vocab_size), dtype=np.float32)

        for i, text in enumerate(texts):
            tokens = self._extract_ngrams(text)
            counts = {}
            for t in tokens:
                if t in self.vocab:
                    counts[t] = counts.get(t, 0) + 1

            for t, count in counts.items():
                idx = self.vocab[t]
                tf = 1 + math.log(count)
                vectors[i, idx] = tf * self.idf[idx]

            norm = np.linalg.norm(vectors[i])
            if norm > 0:
                vectors[i] /= norm

        return vectors


import math


class RAGEngine:
    def __init__(self):
        print("🔄 Initializing RAG Engine...")
        
        # System prompt strictly matching Commerce Chatbot specifications
        self.system_prompt = """You are the official CKPCET Assistant, a premium AI representative of C. K. Pithawalla College of Engineering & Technology (CKPCET), Surat.

ROLE, PERSONA & TONE:
- You are an expert on all things CKPCET Engineering (Admissions, Fees, Courses, Faculty, Campus Life, Hostels).
- Your tone is ALWAYS exceptionally polite, respectful, warm, helpful, and dignified. Treat the user with utmost courtesy (e.g., "Certainly, ...", "Kindly note ...", "Glad to help! ...").
- Be extremely direct and concise. Limit your answer strictly to a maximum of 20 to 30 words. Do NOT exceed 30-35 words under any circumstances.
- Always start your response with a positive, polite opening phrase (e.g., "Certainly, ...", "Of course, ...", "Glad to help! ...") followed immediately by the factual answer.
- IMPORTANT: Ensure critical factual details (e.g. fees, phone numbers, website links) from the context are included.

CRITICAL CONTENT RULES:
- Use the provided context to answer questions about the college.
- If the context doesn't have the answer or is "No specific context available.":
  You MUST decline politely and return the exact fallback phrase:
  "Sorry, my apologies. I don't have that information. Please visit https://ckpcet.ac.in or call +91 78628-24298."

KNOWLEDGE BASE PRIORITY:
- Location: Opp. Surat Airport, Behind DPS School, Near Malvan Mandir, Dumas Road, Surat-395007 (https://goo.gl/maps/tbJVinE8joDNvqbZ6)
- Contact: +91 78628-24298 / +91 63550 55839 | contact@ckpcet.ac.in
- Fees: B.E. tuition fee ~₹44,000 per semester (Pay via GrayQuest: https://grayquest.com/institute/ck-pithawala)"""

        # Initialize lightweight vector embedding model
        print("🔄 Loading lightweight vector embedding model...")
        self.embedding_model = LightweightEmbeddingModel()
        print("✅ Vector model ready!")

        # Load knowledge base
        print("🔄 Loading knowledge base...")
        self.knowledge_base = self._load_knowledge_base()
        print(f"✅ Loaded {len(self.knowledge_base)} entries!")

        # Fit embedding model & create embeddings
        print("🔄 Creating embeddings...")
        doc_texts = []
        for item in self.knowledge_base:
            q = item.get("question", "")
            kw = " ".join(item.get("keywords", []))
            ans = item.get("answer", "")
            doc_texts.append(f"{q} {kw} {ans}")

        self.embedding_model.fit(doc_texts)
        self.embeddings = self.embedding_model.encode(doc_texts)
        print("✅ Embeddings created!")

        # Dynamic opening phrases pool for natural variety
        self.opening_phrases = [
            "Sure! ",
            "Glad to assist! ",
            "Here is what you need to know: ",
            "Happy to help! ",
            "Great question! ",
            "Of course! ",
            "Here are the details: ",
            "Certainly! ",
            "Definitely! ",
        ]
        self.last_opening = None

        # Guardrail
        self.guardrail = InputGuardrail(self.embedding_model, self.knowledge_base, self.embeddings)

        # Conversation history & response cache
        self.conversation_history = {}
        self.session_timestamps = {}
        self.response_cache = {}


        # Follow-up suggestions per category
        self.follow_up_suggestions = {
            "Admissions": [
                "What documents are needed for admission?",
                "What engineering courses are offered?",
                "What is the eligibility for B.E. admissions?",
                "What is the ACPC admission process?",
            ],
            "Fees": [
                "What is the tuition fee structure for engineering?",
                "How do I pay fees or get an EMI option?",
                "Are there scholarships available?",
                "What is the hostel fee?",
            ],
            "Academics": [
                "What engineering courses are offered at CKPCET?",
                "How many semesters are in B.E.?",
                "What is the attendance criteria?",
                "Which GTU syllabus is followed?",
            ],
            "Facilities": [
                "Does the college have hostel facilities?",
                "Is there a canteen on campus?",
                "What sports & gym facilities are available?",
                "Is transport / bus facility available?",
            ],
            "Contact": [
                "How can I contact CKPCET?",
                "Where is CKPCET located?",
                "What are the office working hours?",
                "What is the college email address?",
            ],
            "Placements": [
                "What companies visit for placements?",
                "What is the highest placement package?",
                "Does college provide placement training?",
            ],
            "General": [
                "What courses are offered?",
                "What is the fee structure?",
                "How to get admission?",
                "Does college have hostel facilities?",
                "How can I contact admissions?",
            ],
        }

    def _get_dynamic_opening(self):
        """Get a randomized opening phrase, ensuring no immediate consecutive repeats."""
        available = [p for p in self.opening_phrases if p != self.last_opening]
        chosen = random.choice(available if available else self.opening_phrases)
        self.last_opening = chosen
        return chosen

    def _load_knowledge_base(self):
        """Load knowledge base from JSON file"""
        try:
            with open(Config.DATASET_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("knowledge_base", [])
        except Exception as e:
            print(f"❌ Error loading dataset: {e}")
            return []

    def _cleanup_expired_sessions(self, timeout_seconds=1800):
        """Clean up inactive sessions older than 30 minutes."""
        now = time.time()
        expired = [sid for sid, ts in self.session_timestamps.items() if now - ts > timeout_seconds]
        for sid in expired:
            self.conversation_history.pop(sid, None)
            self.session_timestamps.pop(sid, None)

    def _call_llm_api(self, messages, max_tokens=150, temperature=0.2):
        """Call LLM API via urllib with unverified SSL context to eliminate thread deadlocks on macOS."""
        ctx = ssl._create_unverified_context()

        if Config.GROQ_API_KEY:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {Config.GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            payload = {
                "model": Config.GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode())
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                data = json.loads(resp.read().decode())
                return data["choices"][0]["message"]["content"]
        elif Config.GEMINI_API_KEY:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{Config.GEMINI_MODEL}:generateContent?key={Config.GEMINI_API_KEY}"
            headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
            contents = []
            for m in messages:
                role = "user" if m["role"] in ["user", "system"] else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
            payload = {"contents": contents}
            req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode())
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                data = json.loads(resp.read().decode())
                return data["candidates"][0]["content"]["parts"][0]["text"]
        else:
            raise ValueError("No API keys configured.")

    def _call_llm_api_stream(self, messages, max_tokens=100, temperature=0.2):
        """Stream LLM response token-by-token via SSE."""
        ctx = ssl._create_unverified_context()
        if Config.GROQ_API_KEY:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {Config.GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            payload = {
                "model": Config.GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True
            }
            req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode())
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                for line in resp:
                    line_str = line.decode('utf-8').strip()
                    if not line_str or line_str.startswith(':'):
                        continue
                    if line_str.startswith('data: '):
                        data_str = line_str[6:].strip()
                        if data_str == '[DONE]':
                            break
                        try:
                            chunk = json.loads(data_str)
                            token = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if token:
                                yield token
                        except Exception:
                            pass
        elif Config.GEMINI_API_KEY:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{Config.GEMINI_MODEL}:streamGenerateContent?alt=sse&key={Config.GEMINI_API_KEY}"
            headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
            contents = []
            for m in messages:
                role = "user" if m["role"] in ["user", "system"] else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
            payload = {"contents": contents}
            req = urllib.request.Request(url, headers=headers, data=json.dumps(payload).encode())
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                for line in resp:
                    line_str = line.decode('utf-8').strip()
                    if line_str.startswith('data: '):
                        data_str = line_str[6:].strip()
                        try:
                            chunk = json.loads(data_str)
                            token = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            if token:
                                yield token
                        except Exception:
                            pass
        else:
            raise ValueError("No API keys configured.")

    def _retrieve_context(self, query, top_k=None):
        """Retrieve relevant context using hybrid TF-IDF vector similarity + keyword boosting"""
        if top_k is None:
            top_k = Config.TOP_K_RETRIEVAL

        start_time = time.time()
        query_clean = query.lower().strip()
        query_words = set(re.findall(r'\w+', query_clean))

        query_embedding = self.embedding_model.encode([query])[0]
        similarities = np.dot(self.embeddings, query_embedding) / (
            np.linalg.norm(self.embeddings, axis=1) * np.linalg.norm(query_embedding) + 1e-9
        )

        boosted_scores = np.copy(similarities)
        for idx, item in enumerate(self.knowledge_base):
            q_text = item.get("question", "").lower()
            kws = " ".join(item.get("keywords", [])).lower()
            ans_text = item.get("answer", "").lower()

            match_count = 0
            for word in query_words:
                if len(word) > 2 and (word in q_text or word in kws or word in ans_text):
                    match_count += 1

            if match_count > 0:
                boosted_scores[idx] += 0.35 * match_count

        top_indices = np.argsort(boosted_scores)[::-1][:top_k]

        relevant_contexts = []
        for idx in top_indices:
            if boosted_scores[idx] >= 0.18:
                item = self.knowledge_base[idx]
                relevant_contexts.append(
                    {
                        "question": item.get("question", ""),
                        "answer": item.get("answer", ""),
                        "category": item.get("category", "General"),
                        "similarity": float(boosted_scores[idx]),
                    }
                )

        retrieval_time = time.time() - start_time
        return relevant_contexts, retrieval_time

    def _get_suggestions(self, context, user_input):
        """Get follow-up suggestions strictly prioritized by context category."""
        if not context:
            return self.follow_up_suggestions.get("General", [])[:3]

        primary_category = context[0].get("category", "General")
        pool = list(self.follow_up_suggestions.get(primary_category, []))

        user_lower = user_input.lower()
        pool = [s for s in pool if s.lower() not in user_lower and user_lower not in s.lower()]

        if len(pool) >= 3:
            random.shuffle(pool)
            return pool[:3]

        if primary_category != "General":
            fallback = self.follow_up_suggestions.get("General", [])
            for f in fallback:
                if len(pool) >= 3:
                    break
                if f.lower() not in user_lower:
                    pool.append(f)

        return pool[:3]

    def _update_history(self, session_id, user_input, response):
        """Update conversation history"""
        if session_id not in self.conversation_history:
            self.conversation_history[session_id] = []

        self.conversation_history[session_id].extend(
            [
                {"role": "user", "content": user_input},
                {"role": "assistant", "content": response},
            ]
        )

        if len(self.conversation_history[session_id]) > Config.MAX_HISTORY_LENGTH * 2:
            self.conversation_history[session_id] = self.conversation_history[
                session_id
            ][-Config.MAX_HISTORY_LENGTH * 2:]

    def clear_history(self, session_id="default"):
        """Clear conversation history for a session"""
        if session_id in self.conversation_history:
            self.conversation_history[session_id] = []
            return True
        return False

    def generate_response(self, user_input, session_id="default", preferred_lang="en-IN"):
        """Non-streaming response method for backward compatibility."""
        self.session_timestamps[session_id] = time.time()
        self._cleanup_expired_sessions()
        default_suggestions = [
            "What courses are offered?",
            "Tell me about placements.",
            "What is the fee structure?",
        ]

        try:
            if is_greeting(user_input):
                return {
                    "response": "Hello! 👋 Welcome to CKPCET Chatbot. How can I help you today?",
                    "suggestions": default_suggestions,
                }

            if is_farewell(user_input):
                return {
                    "response": "Thank you for using CKPCET Chatbot! Have a great day! 😊",
                    "suggestions": [],
                }

            st = small_talk_response(user_input)
            if st:
                self._update_history(session_id, user_input, st)
                return {"response": st, "suggestions": default_suggestions}

            guardrail_result = self.guardrail.check(user_input)
            if not guardrail_result["is_safe"]:
                if guardrail_result.get("type") == "did_you_mean":
                    return {
                        "response": f"Did you mean: {guardrail_result['closest_match']}?",
                        "suggestions": default_suggestions,
                        "did_you_mean": guardrail_result['closest_match']
                    }
                return {
                    "response": guardrail_result["guardrail_response"],
                    "suggestions": default_suggestions
                }

            cache_key = generate_cache_key(user_input)
            if Config.ENABLE_CACHE and cache_key in self.response_cache:
                cached = self.response_cache[cache_key]
                if time.time() - cached["timestamp"] < Config.CACHE_TTL:
                    return cached

            context, retrieval_time = self._retrieve_context(user_input)
            english_suggestions = self._get_suggestions(context, user_input)

            if not context:
                fallback_msg = "Sorry, my apologies. I don't have that information. Please visit https://ckpcet.ac.in or call +91 78628-24298."
                self._update_history(session_id, user_input, fallback_msg)
                return {
                    "response": fallback_msg,
                    "suggestions": default_suggestions,
                }

            context_str = "\n\n".join([f"Q: {item['question']}\nA: {item['answer']}" for item in context[:3]])
            prompt_messages = [
                {
                    "role": "system",
                    "content": (
                        f"{self.system_prompt}\n\n"
                        f"Relevant Information from CKPCET Knowledge Base ONLY:\n{context_str}\n\n"
                        f"CRITICAL INSTRUCTION: Answer the user's query directly, politely, and concisely. Keep response to 20-30 words MAXIMUM. If user asks for location/address, include Google Maps link: https://goo.gl/maps/tbJVinE8joDNvqbZ6"
                    )
                },
                {"role": "user", "content": user_input}
            ]

            start_time = time.time()
            raw_response = self._call_llm_api(prompt_messages, max_tokens=80)
            generation_time = time.time() - start_time
            opening = self._get_dynamic_opening()
            response = opening + clean_response(raw_response)

            words = response.split()
            if len(words) > 35:
                response = " ".join(words[:32]) + "."

            loc_keywords = ["location", "located", "where is", "address", "map", "reach", "direction"]
            if any(k in user_input.lower() for k in loc_keywords) and "goo.gl" not in response and "maps" not in response:
                response = response.rstrip(".") + ". 🗺️ Google Maps: https://goo.gl/maps/tbJVinE8joDNvqbZ6"

            self._update_history(session_id, user_input, response)
            result = {"response": response, "suggestions": english_suggestions}

            if Config.ENABLE_CACHE:
                self.response_cache[cache_key] = {**result, "timestamp": time.time()}

            if Config.ENABLE_LOGGING:
                log_query(user_input, response, session_id, retrieval_time, generation_time)

            return result

        except Exception as e:
            print(f"⚠️ Exception in generate_response: {e}")
            fallback_msg = "Sorry, my apologies. I don't have that information. Please visit https://ckpcet.ac.in or call +91 78628-24298."
            return {
                "response": fallback_msg,
                "suggestions": default_suggestions,
            }

    def generate_response_stream(self, user_input, session_id="default", preferred_lang="en-IN"):
        """Stream chatbot response via Server-Sent Events (SSE)."""
        self.session_timestamps[session_id] = time.time()
        self._cleanup_expired_sessions()

        default_suggestions = [
            "What courses are offered?",
            "Tell me about placements.",
            "What is the fee structure?",
        ]

        if is_greeting(user_input):
            msg = "Hello! 👋 Welcome to CKPCET Chatbot. How can I help you today?"
            yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': default_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        if is_farewell(user_input):
            msg = "Thank you for using CKPCET Chatbot! Have a great day! 😊"
            yield f"data: {json.dumps({'type': 'content', 'content': msg})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': []})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        st = small_talk_response(user_input)
        if st:
            self._update_history(session_id, user_input, st)
            yield f"data: {json.dumps({'type': 'content', 'content': st})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': default_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        guardrail_result = self.guardrail.check(user_input)
        if not guardrail_result["is_safe"]:
            if guardrail_result.get("type") == "did_you_mean":
                yield f"data: {json.dumps({'type': 'did_you_mean', 'closest_match': guardrail_result['closest_match'], 'guardrail_response': guardrail_result['guardrail_response']})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'content', 'content': guardrail_result['guardrail_response']})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': default_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        context, retrieval_time = self._retrieve_context(user_input)
        english_suggestions = self._get_suggestions(context, user_input)

        if not context:
            fallback_msg = "Sorry, my apologies. I don't have that information. Please visit https://ckpcet.ac.in or call +91 78628-24298."
            self._update_history(session_id, user_input, fallback_msg)
            yield f"data: {json.dumps({'type': 'content', 'content': fallback_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': default_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        context_str = "\n\n".join([f"Q: {item['question']}\nA: {item['answer']}" for item in context[:3]])
        prompt_messages = [
            {
                "role": "system",
                "content": (
                    f"{self.system_prompt}\n\n"
                    f"Relevant Information from CKPCET Knowledge Base ONLY:\n{context_str}\n\n"
                    f"CRITICAL INSTRUCTION: Answer the user's query directly and concisely without any introductory filler words like 'Certainly', 'Of course', or 'Sure'. Keep response to 20-30 words MAXIMUM. If location/address is asked, include Google Maps link: https://goo.gl/maps/tbJVinE8joDNvqbZ6"
                )
            },
            {"role": "user", "content": user_input}
        ]

        opening = self._get_dynamic_opening()
        yield f"data: {json.dumps({'type': 'content', 'content': opening})}\n\n"
        full_response = opening

        try:
            llm_accumulated = ""
            first_chunk = True

            for token in self._call_llm_api_stream(prompt_messages, max_tokens=100):
                if first_chunk:
                    llm_accumulated += token
                    cleaned_start = re.sub(r"^(certainly|of course|sure|sure thing|absolutely|glad to help|glad to assist)[!.,\s]*", "", llm_accumulated, flags=re.IGNORECASE)
                    if not cleaned_start.strip():
                        continue
                    first_chunk = False
                    token = cleaned_start


                full_response += token
                yield f"data: {json.dumps({'type': 'content', 'content': token})}\n\n"


            cleaned = clean_response(full_response)
            words = cleaned.split()
            if len(words) > 35:
                cleaned = " ".join(words[:32]) + "."

            loc_keywords = ["location", "located", "where is", "address", "map", "reach", "direction"]
            if any(k in user_input.lower() for k in loc_keywords) and "goo.gl" not in cleaned and "maps" not in cleaned:
                map_suffix = " 🗺️ Google Maps: https://goo.gl/maps/tbJVinE8joDNvqbZ6"
                yield f"data: {json.dumps({'type': 'content', 'content': map_suffix})}\n\n"
                cleaned += map_suffix

            self._update_history(session_id, user_input, cleaned)
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': english_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            print(f"⚠️ Exception in generate_response_stream: {e}")
            fallback_msg = "Sorry, my apologies. I don't have that information. Please visit https://ckpcet.ac.in or call +91 78628-24298."
            yield f"data: {json.dumps({'type': 'content', 'content': fallback_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'suggestions', 'suggestions': default_suggestions})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"


class InputGuardrail:
    """Semantic guardrail to detect off-topic or ambiguous queries using local TF-IDF embeddings."""
    def __init__(self, embedding_model, knowledge_base, embeddings):
        self.embedding_model = embedding_model
        self.knowledge_base = knowledge_base
        self.embeddings = embeddings
        self.college_keywords = {
            "ckpcet", "pithawala", "engineering", "college", "admission", "admissions",
            "fee", "fees", "course", "courses", "hostel", "hostels", "placement",
            "placements", "faculty", "principal", "campus", "canteen", "library",
            "scholarship", "acpc", "gtu", "surat", "dumas", "contact", "address",
            "location", "cutoff", "branch", "computer", "it", "civil", "mechanical",
            "electrical", "ec", "aiml", "ds"
        }

    def check(self, user_input):
        user_lower = user_input.lower().strip()
        words = set(re.findall(r'\w+', user_lower))

        has_keyword = bool(words.intersection(self.college_keywords))

        query_vec = self.embedding_model.encode([user_input])[0]
        norms = np.linalg.norm(self.embeddings, axis=1) * np.linalg.norm(query_vec) + 1e-9
        similarities = np.dot(self.embeddings, query_vec) / norms
        max_idx = int(np.argmax(similarities))
        max_sim = float(similarities[max_idx])

        closest_item = self.knowledge_base[max_idx] if max_idx < len(self.knowledge_base) else None

        # 1. Off-topic query with low similarity & no college keywords
        if max_sim < 0.08 and not has_keyword:
            if 0.04 <= max_sim < 0.08 and closest_item:
                return {
                    "is_safe": False,
                    "type": "did_you_mean",
                    "closest_match": closest_item.get("question", ""),
                    "guardrail_response": "I didn't quite understand your query regarding CKPCET. Did you mean:"
                }
            return {
                "is_safe": False,
                "type": "guardrail",
                "guardrail_response": "I am the official CKPCET Assistant, specialized in providing information about C. K. Pithawalla College of Engineering & Technology (courses, admissions, fees, facilities, hostels). How can I assist you with CKPCET today?"
            }

        # 2. Ambiguous query with moderate similarity and short input
        if 0.08 <= max_sim < 0.16 and not has_keyword and len(words) <= 4:
            if closest_item:
                return {
                    "is_safe": False,
                    "type": "did_you_mean",
                    "closest_match": closest_item.get("question", ""),
                    "guardrail_response": f"Did you mean: {closest_item.get('question', '')}?"
                }

        return {"is_safe": True}

