import { useState, useEffect, useRef, useCallback } from "react";

// ─── Utility: pretty label for a URL ─────────────────────────────────────────
function prettyLabel(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    if (host.includes("instagram.com")) return "Instagram ↗";
    if (host.includes("facebook.com")) return "Facebook ↗";
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      if (u.pathname.startsWith("/watch")) return "Watch on YouTube ↗";
      if (u.pathname.startsWith("/@")) return "YouTube Channel ↗";
      return "YouTube ↗";
    }
    if (host.includes("linkedin.com")) return "LinkedIn ↗";
    if (host.includes("goo.gl") || host.includes("maps.google")) return "Google Maps ↗";
    if (host.includes("drive.google.com")) return "View Document ↗";
    if (host.includes("forms.gle") || host.includes("docs.google.com/forms")) return "Open Form ↗";
    if (host.includes("wa.link") || host.includes("whatsapp.com")) return "WhatsApp ↗";
    if (host.includes("ckpipsr.ac.in")) {
      const path = u.pathname.replace(/\/$/, "");
      if (path && path !== "/") return "ckpipsr.ac.in" + path + " ↗";
      return "ckpipsr.ac.in ↗";
    }
    if (host.includes("ckpcet.ac.in") || host.includes("ckpcet.vercel.app")) {
      const path = u.pathname.replace(/\/$/, "");
      if (path && path !== "/") return "ckpcet.ac.in" + path + " ↗";
      return "ckpcet.ac.in ↗";
    }
    if (host.includes("grayquest.com")) return "Pay Fees Online ↗";
    if (host.includes("acpc.gujarat.gov.in")) return "ACPC Portal ↗";
    if (host.includes("gtu.ac.in")) return "GTU Portal ↗";
    if (host.includes("nirfindia.org")) return "NIRF Portal ↗";
    return host + " ↗";
  } catch {
    return url.length > 35 ? url.slice(0, 32) + "…" : url;
  }
}

// ─── Utility: prepare text for natural TTS pronunciation ──────────────────────
function prepareTextForSpeech(text) {
  if (!text) return "";

  let clean = text.replace(/₹\s*(\d+(?:,\d+)*)/g, "$1 Rupees");
  clean = clean.replace(/\bRs\.\s*(\d+(?:,\d+)*)/gi, "$1 Rupees");

  clean = clean
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/[*_~`#|[\]()]/g, " ")
    .replace(/\bCKPCET\b/g, "C K P C E T")
    .replace(/\bCKPIPSR\b/g, "C K P I P S R")
    .replace(/\bGTU\b/g, "G T U")
    .replace(/\bACPC\b/g, "A C P C")
    .replace(/\bB\.E\.\b/gi, "B E")
    .replace(/\bM\.E\.\b/gi, "M E")
    .replace(/\bB\.Pharm\b/gi, "B Pharm")
    .replace(/\bM\.Pharm\b/gi, "M Pharm")
    .replace(/\s+/g, " ")
    .trim();

  return clean;
}

function splitIntoSentences(text) {
  if (!text) return [];
  const rawSentences = text.split(/(?<=[.!?])\s+/);
  const result = [];
  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (trimmed) result.push(trimmed);
  }
  return result;
}

function getNaturalVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();

  const preferredNames = ["Google US English", "Samantha", "Victoria", "Karen", "Zira", "Jenny", "Ava", "Serena", "Natural"];
  for (const name of preferredNames) {
    const v = voices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase()));
    if (v) return v;
  }

  const enUs = voices.find((v) => v.lang === "en-US" && !v.name.includes("Fred") && !v.name.includes("Albert"));
  if (enUs) return enUs;

  return voices.find((v) => v.lang.startsWith("en")) || null;
}

// ─── Native Web Speech Queue Manager ──────────────────────────────────────────
class SpeechQueueManager {
  constructor() {
    this.queue = [];
    this.isSpeaking = false;
  }

  speak(text) {
    if (!text) return;
    this.cancel();

    const prepared = prepareTextForSpeech(text);
    const sentences = splitIntoSentences(prepared);
    if (sentences.length === 0) return;

    this.queue = sentences;
    this.isSpeaking = true;
    this.processNext();
  }

  processNext() {
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      return;
    }

    if (!("speechSynthesis" in window)) {
      this.isSpeaking = false;
      return;
    }

    const nextSentence = this.queue.shift();
    const utterance = new SpeechSynthesisUtterance(nextSentence);
    utterance.lang = "en-US";
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    const v = getNaturalVoice();
    if (v) utterance.voice = v;

    utterance.onend = () => {
      setTimeout(() => this.processNext(), 150);
    };
    utterance.onerror = () => {
      setTimeout(() => this.processNext(), 150);
    };

    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    this.queue = [];
    this.isSpeaking = false;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

// ─── Utility: linkify text + render newlines + Markdown support ──────────────
function Linkified({ text }) {
  if (!text) return null;

  // 1. Extract markdown links [label](url)
  const markdownRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = markdownRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "link", label: match[1], url: match[2] });
    lastIndex = markdownRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((part, idx) => {
        if (part.type === "link") {
          return (
            <a
              key={idx}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#2563eb",
                textDecoration: "underline",
                fontWeight: 600,
                padding: "0 2px"
              }}
            >
              {part.label} ↗
            </a>
          );
        }

        const tokens = part.content.split(/(\s+)/);
        return (
          <span key={idx}>
            {tokens.map((token, i) => {
              let cleanToken = token.trim();
              let trailingPunct = "";
              const punctMatch = cleanToken.match(/([.,!?)]+)$/);
              if (punctMatch) {
                trailingPunct = punctMatch[1];
                cleanToken = cleanToken.slice(0, -trailingPunct.length);
              }

              if (/^(https?:\/\/[^\s]+|www\.[^\s]+)$/i.test(cleanToken)) {
                const href = cleanToken.startsWith("www.") ? `https://${cleanToken}` : cleanToken;
                return (
                  <span key={i}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#2563eb",
                        textDecoration: "underline",
                        fontWeight: 600,
                        padding: "0 2px"
                      }}
                    >
                      {prettyLabel(href)}
                    </a>
                    {trailingPunct}
                  </span>
                );
              }
              return token;
            })}
          </span>
        );
      })}
    </span>
  );
}

// ─── Loading dots ─────────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div style={styles.loadingDots}>
      <span style={{ ...styles.dot, animationDelay: "0s" }} />
      <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
      <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
    </div>
  );
}

// ─── Single message bubble ───────────────────────────────────────────────────
function MessageBubble({ msg, onSuggestionClick }) {
  const isUser = msg.role === "user";

  return (
    <div className="msg-slide-in" style={{ ...styles.msgWrapper, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && <div style={styles.botAvatar}>🏛️</div>}
      <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.botBubble) }}>
          <Linkified text={msg.content} />
        </div>

        {/* Did You Mean Card */}
        {!isUser && msg.didYouMean && (
          <div style={{
            marginTop: 8,
            padding: 10,
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: 10,
            width: "100%"
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0369a1", marginBottom: 6 }}>
              🤔 Did you mean this question?
            </div>
            <button
              className="sug-chip"
              style={{
                ...styles.suggestionChip,
                background: "#ffffff",
                color: "#0284c7",
                borderColor: "#38bdf8",
                fontWeight: 600,
                textAlign: "left",
                width: "100%",
                padding: "8px 10px"
              }}
              onClick={() => onSuggestionClick(msg.didYouMean)}
            >
              ❓ {msg.didYouMean}
            </button>
          </div>
        )}

        {/* Suggestion Chips */}
        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
          <div style={styles.suggestionsContainer}>
            <div style={styles.suggestionsLabel}>💡 Related Questions:</div>
            <div style={styles.suggestionsGrid}>
              {msg.suggestions.map((sug, idx) => (
                <button
                  key={idx}
                  className="sug-chip"
                  style={styles.suggestionChip}
                  onClick={() => onSuggestionClick(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {isUser && <div style={styles.userAvatar}>👤</div>}
    </div>
  );
}


// ─── FAQ Chip ─────────────────────────────────────────────────────────────────
function FAQChip({ faq, onSelect }) {
  return (
    <div className="faq-card" style={styles.faqCard} onClick={() => onSelect(faq.question)}>
      <div style={styles.faqStreamBadge}>{faq.stream || "Engineering"}</div>
      <div style={styles.faqQuestion}>❓ {faq.question}</div>
      <div style={styles.faqPreview}>{faq.preview}</div>
    </div>
  );
}

// ─── Main Chatbot Component ──────────────────────────────────────────────────
export default function CKPCETchatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chatbot_messages")) || [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
    let sid = localStorage.getItem("chatbot_session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("chatbot_session_id", sid);
    }
    return sid;
  });
  const [faqs, setFaqs] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [isChatEnded, setIsChatEnded] = useState(() => {
    return localStorage.getItem("chatbot_chat_ended") === "true";
  });
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // Survey state
  const [surveyStars, setSurveyStars] = useState(0);
  const [surveyGoal, setSurveyGoal] = useState("");
  const [surveyComments, setSurveyComments] = useState("");
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  // TTS state
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => {
    return localStorage.getItem("isTtsEnabled") === "true";
  });
  const isTtsEnabledRef = useRef(isTtsEnabled);
  useEffect(() => {
    isTtsEnabledRef.current = isTtsEnabled;
  }, [isTtsEnabled]);

  // Autocomplete
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const speechManagerRef = useRef(null);
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  // Categories list matching site branding
  const categories = ["All", "Admissions", "Courses", "Fees", "Facilities", "Contact"];

  // Initialize Speech Queue Manager
  useEffect(() => {
    speechManagerRef.current = new SpeechQueueManager();
    return () => {
      speechManagerRef.current?.cancel();
    };
  }, []);

  // Sync messages to localStorage
  useEffect(() => {
    localStorage.setItem("chatbot_messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("chatbot_chat_ended", String(isChatEnded));
  }, [isChatEnded]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load FAQs once
  useEffect(() => {
    fetch("/get_faqs")
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs || []))
      .catch(() => { });
  }, []);

  // Focus input when chat opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  // Debounced Autocomplete Fetcher
  useEffect(() => {
    if (!input.trim() || input.trim().length < 2) {
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
      return;
    }

    const delayDebounce = setTimeout(() => {
      fetch(`/api/autocomplete?q=${encodeURIComponent(input.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.suggestions && data.suggestions.length > 0) {
            setAutocompleteSuggestions(data.suggestions);
            setShowAutocomplete(true);
          } else {
            setAutocompleteSuggestions([]);
            setShowAutocomplete(false);
          }
        })
        .catch(() => {
          setAutocompleteSuggestions([]);
          setShowAutocomplete(false);
        });
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [input]);

  // Toggle TTS
  const toggleTts = () => {
    setIsTtsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("isTtsEnabled", String(next));
      if (!next) {
        speechManagerRef.current?.cancel();
      } else {
        const unlock = new SpeechSynthesisUtterance("");
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      }
      return next;
    });
  };

  // ── Send message (SSE Streaming) ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (overrideText) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading) return;

      setInput("");
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
      speechManagerRef.current?.cancel();

      if (isTtsEnabledRef.current) {
        const unlock = new SpeechSynthesisUtterance("");
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      }

      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
        setIsListening(false);
      }

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "bot", content: "", suggestions: [] }
      ]);
      setLoading(true);

      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            session_id: sessionId,
            stream: true,
          }),
        });

        if (!res.ok) {
          throw new Error("HTTP error connecting to chatbot api");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let streamDone = false;
        let accumulatedText = "";
        let fetchedSuggestions = [];
        let didYouMeanMatch = null;
        let buffer = "";

        while (!streamDone) {
          const { value, done: readerDone } = await reader.read();
          streamDone = readerDone;

          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const jsonStr = trimmed.slice(6);
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.type === "content") {
                    accumulatedText += parsed.content;
                    setMessages((prev) => {
                      const next = [...prev];
                      if (next.length > 0) {
                        next[next.length - 1] = {
                          role: "bot",
                          content: accumulatedText,
                          suggestions: fetchedSuggestions,
                          didYouMean: didYouMeanMatch,
                        };
                      }
                      return next;
                    });
                  } else if (parsed.type === "did_you_mean") {
                    didYouMeanMatch = parsed.closest_match;
                    accumulatedText = parsed.guardrail_response;
                    setMessages((prev) => {
                      const next = [...prev];
                      if (next.length > 0) {
                        next[next.length - 1] = {
                          role: "bot",
                          content: accumulatedText,
                          suggestions: fetchedSuggestions,
                          didYouMean: didYouMeanMatch,
                        };
                      }
                      return next;
                    });
                  } else if (parsed.type === "suggestions") {
                    fetchedSuggestions = parsed.suggestions || [];
                    setMessages((prev) => {
                      const next = [...prev];
                      if (next.length > 0) {
                        next[next.length - 1] = {
                          ...next[next.length - 1],
                          suggestions: fetchedSuggestions,
                        };
                      }
                      return next;
                    });
                  } else if (parsed.type === "done") {
                    streamDone = true;
                  }
                } catch (e) {
                  console.error("Error parsing SSE line:", e);
                }
              }
            }
          }
        }

        if (isTtsEnabledRef.current && accumulatedText) {
          speechManagerRef.current?.speak(accumulatedText);
        }

      } catch (err) {
        console.error("Chatbot API error:", err);
        setMessages((prev) => {
          const next = [...prev];
          if (next.length > 0 && next[next.length - 1].role === "bot" && next[next.length - 1].content === "") {
            next[next.length - 1] = {
              role: "bot",
              content: "Sorry, my apologies. Please make sure the backend server is running on port 5005.",
              suggestions: [],
            };
          }
          return next;
        });
      } finally {
        setLoading(false);
      }
    },

    [input, loading, sessionId]
  );

  // ── Voice Recognition: hybrid approach ─────────────────────────────────────
  // Path A (Chrome / Edge / Samsung Internet):  native window.SpeechRecognition
  //   → instant, free, no API call.
  // Path B (Safari / Firefox / any other browser): MediaRecorder → /api/transcribe
  //   → Groq Whisper on the backend, works universally.

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);

  // Stop an active MediaRecorder recording and send audio to Groq Whisper
  const stopAndTranscribe = async () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop(); // triggers ondataavailable + onstop
  };

  const toggleListening = () => {
    speechManagerRef.current?.cancel();

    // ── Path A: native Web Speech API (Chromium browsers) ──────────────────
    const NativeSpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (NativeSpeechRecognition) {
      if (isListening) {
        recognitionRef.current?.stop();
        setIsListening(false);
        return;
      }

      try {
        const recognition = new NativeSpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = "en-US";
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend   = () => setIsListening(false);

        recognition.onresult = (event) => {
          const transcript = event.results[0][0]?.transcript;
          if (transcript) sendMessage(transcript);
        };

        recognition.onerror = () => setIsListening(false);
        recognition.start();
      } catch (err) {
        console.error("Native STT failed, falling back to Whisper:", err);
        // Fall through to Path B below
      }
      return;
    }

    // ── Path B: MediaRecorder → /api/transcribe (Safari / Firefox) ─────────
    if (isListening) {
      // Stop recording → triggers onstop → sends audio
      stopAndTranscribe();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Microphone access is not supported in this browser.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        audioChunksRef.current = [];

        // Pick best supported MIME type
        const mimeType =
          MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"   // Safari fallback
            : "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Stop all mic tracks
          stream.getTracks().forEach((t) => t.stop());
          setIsListening(false);

          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType || "audio/webm",
          });

          if (audioBlob.size < 1000) return; // silence / too short

          try {
            const formData = new FormData();
            const ext = mimeType.includes("mp4") ? "mp4" : "webm";
            formData.append("audio", audioBlob, `recording.${ext}`);

            const res = await fetch("/api/transcribe", {
              method: "POST",
              body: formData,
            });
            const data = await res.json();
            const transcript = (data.transcript || "").trim();
            if (transcript) sendMessage(transcript);
          } catch (err) {
            console.error("Whisper transcription failed:", err);
          }
        };

        recorder.start();
        setIsListening(true);
      })
      .catch((err) => {
        console.error("Mic access denied:", err);
        alert("Please allow microphone access to use voice input.");
      });
  };

  // Start new chat
  const startNewChat = () => {
    speechManagerRef.current?.cancel();
    const newSid = crypto.randomUUID();
    setSessionId(newSid);
    localStorage.setItem("chatbot_session_id", newSid);
    setMessages([]);
    setIsChatEnded(false);
    setSurveyStars(0);
    setSurveyGoal("");
    setSurveyComments("");
    setSurveySubmitted(false);

    fetch("/clear_history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: newSid }),
    }).catch(() => { });
  };

  // Download transcript
  const downloadTranscript = () => {
    let transcriptText = `CKPCET Engineering Chatbot Transcript (${new Date().toLocaleString()})\n`;
    transcriptText += `Session ID: ${sessionId}\n`;
    transcriptText += `=`.repeat(50) + `\n\n`;

    messages.forEach((m) => {
      const roleName = m.role === "user" ? "Student" : "CKPCET Assistant";
      transcriptText += `[${roleName}]:\n${m.content}\n\n`;
    });

    const blob = new Blob([transcriptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CKPCET_Transcript_${sessionId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Submit Feedback
  const submitFeedback = async () => {
    if (!surveyStars && !surveyGoal && !surveyComments.trim()) return;

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stars: surveyStars,
          met_goal: surveyGoal,
          comments: surveyComments.trim()
        }),
      });
      setSurveySubmitted(true);
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };

  // Filtered history messages
  const filteredHistory = messages.filter((m) =>
    historySearchQuery
      ? m.content.toLowerCase().includes(historySearchQuery.toLowerCase())
      : true
  );

  return (
    <>
      <style>{globalCSS}</style>

      {/* ── Page Container ─────────────────────────────────────────── */}
      <div style={styles.page}>
        <nav style={styles.nav}>
          <div style={styles.navBrand}>CKPCET</div>
          <div style={styles.navLinks}>
            <a href="/" style={styles.navLink}>Home</a>
            <a href="https://ckpcet.ac.in/about/academics/admission" target="_blank" rel="noreferrer" style={styles.navLink}>Admissions</a>
            <a href="https://ckpcet.ac.in/about/academics/programs" target="_blank" rel="noreferrer" style={styles.navLink}>Courses</a>
            <a href="https://ckpcet.ac.in/about/institute/reach-us" target="_blank" rel="noreferrer" style={styles.navLink}>Contact</a>
          </div>
        </nav>

        <main style={styles.hero}>
          <div style={styles.heroInner}>
            <div style={styles.heroBadge}>✨ Official AI Assistant • 24 × 7 Support</div>
            <h1 style={styles.heroTitle}>
              C. K. Pithawala College of<br />
              <span style={styles.heroAccent}>Engineering & Technology</span>
            </h1>
            <p style={styles.heroSub}>
              Affiliated with GTU & AICTE Approved. Ask any question about B.E./M.E. admissions, tuition fees, scholarships, and campus facilities.
            </p>
            <button className="hero-cta" style={styles.heroCTA} onClick={() => setOpen(true)}>
              💬 Launch CKPCET Assistant
            </button>
          </div>

          <div className="hero-card" style={styles.heroCard}>
            <div style={styles.cardStat}><span style={styles.cardNum}>6+</span><span style={styles.cardLbl}>B.E. Programs</span></div>
            <div className="card-divider" style={styles.cardDivider} />
            <div style={styles.cardStat}><span style={styles.cardNum}>GTU</span><span style={styles.cardLbl}>Affiliated</span></div>
            <div className="card-divider" style={styles.cardDivider} />
            <div style={styles.cardStat}><span style={styles.cardNum}>100</span><span style={styles.cardLbl}>Acre Campus</span></div>
          </div>
        </main>

        {/* FAQ section */}
        {faqs.length > 0 && (
          <section style={styles.faqSection}>
            <h2 style={styles.faqHeading}>Frequently Asked Questions</h2>
            <div style={styles.faqGrid}>
              {faqs.map((f, i) => (
                <FAQChip key={i} faq={f} onSelect={(q) => { setOpen(true); setTimeout(() => sendMessage(q), 300); }} />
              ))}
            </div>
          </section>
        )}

        <footer style={styles.footer}>© 2026 C. K. Pithawala College of Engineering and Technology, Surat</footer>
      </div>

      {/* ── Floating Toggle FAB ──────────────────────────────────────── */}
      <button
        className={`chat-fab ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle chat"
      >
        <span className="fab-pulse-ring" />
        {open ? "✖" : "💬"}
      </button>

      {/* ── Chat Widget Layout Wrapper ────────────────────────────── */}
      <div className={`chat-container-layout ${open ? "open" : ""} ${showHistoryDrawer ? "drawer-open" : ""}`}>
        
        {/* History Sidebar Panel */}
        <div className={`history-drawer ${showHistoryDrawer ? "open" : ""}`}>
          <div style={styles.drawerHeader}>
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span>🕒</span> Search History
            </div>
            <button style={styles.closeDrawerBtn} onClick={() => setShowHistoryDrawer(false)}>✖</button>
          </div>

          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0B1E36" }}>
            <input
              type="text"
              placeholder="Search chat history..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              style={styles.historySearchInput}
            />
          </div>

          <div className="drawer-content" style={styles.drawerContent}>
            {filteredHistory.length === 0 ? (
              <div style={styles.drawerEmpty}>
                <span style={{ fontSize: 32 }}>📁</span>
                <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>No matching records found.</p>
              </div>
            ) : (
              <div style={styles.drawerLog}>
                {filteredHistory.map((m, idx) => (
                  <div key={idx} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 11, color: m.role === "user" ? "#d4af37" : "#3b82f6", fontWeight: 700, textTransform: "uppercase" }}>
                      {m.role === "user" ? "Student" : "Assistant"}
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {m.role === "user" ? m.content : m.content || "..."}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Widget Container */}
        <div className={`chat-widget ${open ? "open" : ""}`} aria-hidden={!open}>

          {/* Header */}
          <div style={styles.widgetHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={styles.avatar}>🏛️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>CKPCET Assistant</div>
                <div style={{ fontSize: 11, color: "#d4af37", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  Online • Engineering AI
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                className="header-action-btn"
                style={{
                  ...styles.headerActionBtn,
                  background: isTtsEnabled ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.08)",
                  color: isTtsEnabled ? "#d4af37" : "rgba(255,255,255,0.85)"
                }}
                onClick={toggleTts}
                title={isTtsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
              >
                {isTtsEnabled ? "🔊" : "🔇"}
              </button>
              <button 
                className="header-action-btn"
                style={{ 
                  ...styles.headerActionBtn, 
                  background: showHistoryDrawer ? "rgba(212,175,55,0.25)" : "rgba(255,255,255,0.08)",
                  border: showHistoryDrawer ? "1px solid rgba(212,175,55,0.6)" : "1px solid transparent"
                }} 
                onClick={() => setShowHistoryDrawer(prev => !prev)} 
                title="Search History"
              >
                🕒
              </button>
              <button 
                className="header-action-btn"
                style={styles.headerActionBtn} 
                onClick={() => setIsChatEnded(true)} 
                title="End Session"
              >
                ⏻
              </button>
              <button 
                className="header-action-btn"
                style={styles.headerActionBtn} 
                onClick={() => setOpen(false)} 
                title="Close Chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={styles.categoryBar}>
            {categories.map((cat) => (
              <button
                key={cat}
                style={{
                  ...styles.categoryTab,
                  background: activeCategory === cat ? "#d4af37" : "rgba(255,255,255,0.08)",
                  color: activeCategory === cat ? "#0B1E36" : "rgba(255,255,255,0.8)",
                  fontWeight: activeCategory === cat ? 700 : 500
                }}
                onClick={() => {
                  setActiveCategory(cat);
                  if (cat === "Admissions") sendMessage("What are the engineering admission requirements?");
                  else if (cat === "Courses") sendMessage("What engineering courses are offered?");
                  else if (cat === "Fees") sendMessage("What is the fee structure for B.E.?");
                  else if (cat === "Facilities") sendMessage("What hostel and campus facilities are available?");
                  else if (cat === "Contact") sendMessage("How can I contact CKPCET?");
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="chat-messages-container" style={styles.messages}>
            
            {/* Ended banner */}
            {isChatEnded && (
              <div className="ended-banner">
                <div style={{ fontSize: 13, fontWeight: 700 }}>The chat session has ended.</div>
                <div className="ended-banner-btns">
                  <button className="ended-banner-btn primary" onClick={startNewChat}>
                    🔄 Start new chat
                  </button>
                  <button className="ended-banner-btn secondary" onClick={downloadTranscript}>
                    📥 Download transcript
                  </button>
                  <button className="ended-banner-btn secondary" onClick={() => setIsChatEnded(false)}>
                    ↩ Resume chat
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🏛️</div>
                <p style={{ fontWeight: 700, margin: "8px 0 4px", fontSize: 15, fontFamily: "'Playfair Display', serif", color: "#0B1E36" }}>
                  Welcome to CKPCET Assistant!
                </p>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 12 }}>
                  Ask me about Computer, IT, Civil, Mechanical, Electrical engineering, fees, or admissions.
                </p>
                
                {/* Quick prompt cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "100%", width: "100%", marginTop: 8 }}>
                  <button className="welcome-card-btn" onClick={() => sendMessage("What engineering courses are offered?")}>
                    📚 What engineering courses are offered?
                  </button>
                  <button className="welcome-card-btn" onClick={() => sendMessage("What is the tuition fee structure for B.E.?")}>
                    💰 What is the tuition fee structure?
                  </button>
                  <button className="welcome-card-btn" onClick={() => sendMessage("What are the admission requirements for BE?")}>
                    📝 Admission process & GUJCET criteria
                  </button>
                  <button className="welcome-card-btn" onClick={() => sendMessage("What is the SSIP startup funding program?")}>
                    💡 SSIP & Startup funding program
                  </button>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} onSuggestionClick={sendMessage} />
            ))}

            {loading && <LoadingDots />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Row or Survey Form */}
          {!isChatEnded ? (
            <div style={styles.inputRow}>
              <input
                ref={inputRef}
                className="chat-input"
                style={styles.inputField}
                value={input}
                placeholder="Ask about admissions, courses, fees…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
              />
              <button
                style={{
                  ...styles.iconBtn,
                  background: isListening ? "#dc2626" : "rgba(37,99,235,0.1)",
                  color: isListening ? "white" : "#2563eb",
                  animation: isListening ? "pulse 1.5s infinite" : "none",
                  opacity: loading ? 0.5 : 1
                }}
                onClick={toggleListening}
                disabled={loading}
                title={isListening ? "Listening... Click to stop" : "Ask by speaking"}
              >
                {isListening ? "🛑" : "🎤"}
              </button>
              <button
                style={{ ...styles.iconBtn, opacity: !input.trim() || loading ? 0.5 : 1 }}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                title="Send"
              >
                ➤
              </button>
            </div>
          ) : (
            // Student Survey form
            <div style={{ padding: "16px", borderTop: "1px solid rgba(0, 0, 0, 0.08)", background: "white" }}>
              {surveySubmitted ? (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#d4af37", fontWeight: 700 }}>
                  🙏 Thank you for your feedback!
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1E36", marginBottom: 8 }}>
                    Rate your experience:
                  </div>
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className="star-btn"
                        onClick={() => setSurveyStars(star)}
                        style={{
                          color: star <= surveyStars ? "#d4af37" : "rgba(0,0,0,0.15)"
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1E36", marginBottom: 6 }}>
                    Were your queries fully answered?
                  </div>
                  <div style={{ display: "flex", gap: 14, marginBottom: 12, fontSize: 13 }}>
                    {["Yes", "No", "Partially"].map((opt) => (
                      <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="met_goal"
                          value={opt}
                          checked={surveyGoal === opt}
                          onChange={(e) => setSurveyGoal(e.target.value)}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1E36", marginBottom: 6 }}>
                    Any comments or suggestions?
                  </div>
                  <textarea
                    className="survey-textarea"
                    value={surveyComments}
                    onChange={(e) => setSurveyComments(e.target.value)}
                    placeholder="Share your thoughts..."
                    rows={2}
                  />

                  <button
                    style={{
                      width: "100%",
                      background: `linear-gradient(135deg, #0B1E36, #1E40AF)`,
                      color: "white",
                      border: "none",
                      padding: "10px",
                      borderRadius: "12px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginTop: 8
                    }}
                    onClick={submitFeedback}
                  >
                    Submit Feedback
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Autocomplete dropdown suggestions */}
          {showAutocomplete && autocompleteSuggestions.length > 0 && !isChatEnded && (
            <div style={styles.autocompleteContainer}>
              {autocompleteSuggestions.map((s, idx) => (
                <div
                  key={idx}
                  style={styles.autocompleteItem}
                  onClick={() => {
                    sendMessage(s);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(59,130,246,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "white";
                  }}
                >
                  🔍 {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const NAVY = "#0B1E36";
const ACCENT_BLUE = "#1E40AF";
const GOLD = "#D4AF37";
const BG_SLATE = "#F8FAFC";
const INK = "#0F172A";

const styles = {
  page: { minHeight: "100vh", background: BG_SLATE, fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", color: INK },

  nav: { background: NAVY, color: "white", padding: "16px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100, borderBottom: `2px solid ${GOLD}` },
  navBrand: { fontSize: 24, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Playfair Display', serif" },
  navLinks: { display: "flex", gap: 28 },
  navLink: { color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 14, fontWeight: 500 },

  hero: { background: `linear-gradient(135deg, ${NAVY}, ${ACCENT_BLUE})`, color: "white", padding: "72px 36px", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center", justifyContent: "center", borderBottom: `2px solid ${GOLD}` },
  heroInner: { maxWidth: 580 },
  heroBadge: { background: "rgba(212,175,55,0.2)", color: GOLD, border: `1px solid ${GOLD}`, display: "inline-block", padding: "6px 14px", borderRadius: 20, fontSize: 12, letterSpacing: 1, marginBottom: 18, fontWeight: 600 },
  heroTitle: { fontSize: "clamp(28px, 4.5vw, 46px)", fontWeight: 800, lineHeight: 1.25, margin: "0 0 18px", fontFamily: "'Playfair Display', serif" },
  heroAccent: { color: GOLD },
  heroSub: { fontSize: 16, opacity: 0.9, lineHeight: 1.7, margin: "0 0 28px" },
  heroCTA: { background: GOLD, color: NAVY, border: "none", padding: "14px 28px", borderRadius: 30, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 20px rgba(212,175,55,0.3)", transition: "transform 0.2s" },

  heroCard: { background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "28px 36px", display: "flex", gap: 24, alignItems: "center" },
  cardStat: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  cardNum: { fontSize: 28, fontWeight: 800, color: GOLD },
  cardLbl: { fontSize: 12, opacity: 0.85, textAlign: "center" },
  cardDivider: { width: 1, height: 48, background: "rgba(255,255,255,0.25)" },

  faqSection: { padding: "48px 32px", maxWidth: 1100, margin: "0 auto", width: "100%" },
  faqHeading: { fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 24, textAlign: "center", fontFamily: "'Playfair Display', serif" },
  faqGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 },
  faqCard: { background: "white", borderRadius: 16, padding: 20, border: "1px solid rgba(0,0,0,0.06)", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.04)", transition: "transform 0.2s, box-shadow 0.2s" },
  faqStreamBadge: { fontSize: 11, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  faqQuestion: { fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 },
  faqPreview: { fontSize: 13, color: "#64748b", lineHeight: 1.5 },

  footer: { marginTop: "auto", background: NAVY, color: "rgba(255,255,255,0.6)", padding: 24, textAlign: "center", fontSize: 13, borderTop: `1px solid ${GOLD}` },

  // Widget Header & Category Bar
  widgetHeader: { background: NAVY, color: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottom: "1px solid rgba(255,255,255,0.08)" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: GOLD, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 },
  headerActionBtn: { width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease", padding: 0 },

  categoryBar: { background: "#0B1E36", padding: "8px 12px", display: "flex", gap: 6, overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  categoryTab: { border: "none", borderRadius: 14, padding: "4px 10px", fontSize: 11, cursor: "pointer", whitespace: "nowrap" },

  messages: { flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", scrollBehavior: "smooth", willChange: "scroll-position" },
  emptyState: { textAlign: "center", margin: "auto", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center" },
  emptyIcon: { fontSize: 42 },

  msgWrapper: { display: "flex", gap: 10, alignItems: "flex-start" },
  botAvatar: { width: 30, height: 30, borderRadius: "50%", background: NAVY, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
  userAvatar: { width: 30, height: 30, borderRadius: "50%", background: ACCENT_BLUE, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
  bubble: { padding: "12px 16px", borderRadius: 18, fontSize: 14, lineHeight: 1.6, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" },
  userBubble: { background: ACCENT_BLUE, color: "white", borderBottomRightRadius: 4 },
  botBubble: { background: "white", color: INK, borderBottomLeftRadius: 4, border: "1px solid rgba(0,0,0,0.06)" },

  suggestionsContainer: { marginTop: 10, width: "100%" },
  suggestionsLabel: { fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 },
  suggestionsGrid: { display: "flex", flexWrap: "wrap", gap: 6 },
  suggestionChip: { background: "white", border: "1px solid #cbd5e1", borderRadius: 16, padding: "6px 12px", fontSize: 12, color: ACCENT_BLUE, cursor: "pointer", fontWeight: 600, textAlign: "left" },

  inputRow: { padding: 14, background: "white", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", gap: 10, alignItems: "center", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  inputField: { flex: 1, border: "1px solid #cbd5e1", borderRadius: 24, padding: "10px 16px", fontSize: 14, outline: "none" },
  iconBtn: { width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: "rgba(59,130,246,0.1)", color: ACCENT_BLUE },

  // History Drawer
  drawerHeader: { padding: "16px 20px", background: NAVY, color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" },
  historySearchInput: { width: "100%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "white", outline: "none" },
  closeDrawerBtn: { background: "none", border: "none", color: "white", fontSize: 14, cursor: "pointer" },
  drawerContent: { padding: 16, flex: 1, overflowY: "auto", background: "#0B1E36" },
  drawerEmpty: { textAlign: "center", padding: "32px 16px" },
  drawerLog: { display: "flex", flexDirection: "column" },

  // Autocomplete suggestions
  autocompleteContainer: { position: "absolute", bottom: 65, left: 16, right: 16, background: "white", borderRadius: 12, border: "1px solid #cbd5e1", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 120, maxHeight: 180, overflowY: "auto" },
  autocompleteItem: { padding: "10px 14px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f1f5f9", color: INK },

  loadingDots: { display: "flex", gap: 4, padding: "8px 12px", background: "white", borderRadius: 16, width: "fit-content", border: "1px solid rgba(0,0,0,0.06)" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: ACCENT_BLUE, animation: "bounce 1.4s infinite ease-in-out both" },
};

// Global CSS & Animations
const globalCSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap');

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
  100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
}
@keyframes pulseGlow {
  0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.5); }
  70% { box-shadow: 0 0 0 14px rgba(212, 175, 55, 0); }
  100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-slide-in {
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.chat-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: ${NAVY};
  color: ${GOLD};
  border: 2px solid ${GOLD};
  font-size: 24px;
  box-shadow: 0 10px 28px rgba(11, 30, 54, 0.4);
  cursor: pointer;
  z-index: 1000;
  animation: pulseGlow 3s infinite;
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.chat-fab:hover {
  transform: scale(1.1);
}

.header-action-btn:hover {
  background: rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
  transform: translateY(-1px);
}

.chat-container-layout {
  position: fixed;
  bottom: 96px;
  right: 24px;
  z-index: 999;
  display: flex;
  gap: 16px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(20px) scale(0.95);
  transition: opacity 0.3s, transform 0.3s;
}
.chat-container-layout.open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.chat-widget {
  width: 380px;
  height: 590px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 120px);
  background: white;
  border-radius: 20px;
  box-shadow: 0 16px 48px rgba(11, 30, 54, 0.25);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(11, 30, 54, 0.15);
}

.history-drawer {
  width: 280px;
  height: 590px;
  max-height: calc(100vh - 120px);
  background: #0B1E36;
  border-radius: 20px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transform: translateX(300px);
  display: none;
  transition: transform 0.3s;
}
.history-drawer.open {
  display: flex;
  transform: translateX(0);
}

.sug-chip:hover {
  background: #eff6ff !important;
  border-color: ${ACCENT_BLUE} !important;
}
.welcome-card-btn {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: ${NAVY};
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}
.welcome-card-btn:hover {
  background: #eff6ff;
  border-color: ${ACCENT_BLUE};
  color: ${ACCENT_BLUE};
}

.ended-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 12px 14px;
  text-align: center;
  color: ${NAVY};
}
.ended-banner-btns {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 10px;
  flex-wrap: wrap;
}
.ended-banner-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.ended-banner-btn.primary {
  background: ${ACCENT_BLUE};
  color: white;
}
.ended-banner-btn.secondary {
  background: white;
  color: ${NAVY};
  border: 1px solid #cbd5e1;
}

.star-rating {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.star-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
}
.survey-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  outline: none;
  resize: none;
}

@media (max-width: 768px) {
  .nav {
    padding: 12px 16px !important;
    flex-direction: column !important;
    gap: 10px !important;
    align-items: center !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .navLinks {
    gap: 12px !important;
    flex-wrap: wrap !important;
    justify-content: center !important;
    width: 100% !important;
  }
  .navLink {
    font-size: 12px !important;
  }
  .hero {
    padding: 36px 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  .heroInner {
    width: 100% !important;
  }
  .heroCard {
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 16px 12px !important;
    gap: 8px !important;
  }
  .cardNum {
    font-size: 22px !important;
  }
  .cardLbl {
    font-size: 11px !important;
  }
  .faqSection {
    padding: 28px 16px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .faqGrid {
    grid-template-columns: 1fr !important;
  }

  /* Full-Screen Premium Mobile Chat Experience */
  .chat-container-layout.open {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    z-index: 10000 !important;
    transform: none !important;
  }

  .chat-widget {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }

  .history-drawer.open {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-height: 100dvh !important;
    z-index: 10500 !important;
    border-radius: 0 !important;
    border: none !important;
  }

  .chat-fab {
    bottom: 18px !important;
    right: 18px !important;
    width: 56px !important;
    height: 56px !important;
  }

  .chat-fab.open {
    display: none !important;
  }
}

`;