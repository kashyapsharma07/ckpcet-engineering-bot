# CKP Engineering Bot

A full-stack AI-powered chatbot built with Flask and React that uses Retrieval-Augmented Generation (RAG) to provide intelligent responses about CKP Engineering topics.

## 🚀 Features

- **RAG-Powered Responses**: Uses semantic search and retrieval-augmented generation for intelligent Q&A
- **Multi-AI Support**: Integrates with both Google Gemini and OpenAI APIs
- **FAQ Knowledge Base**: Pre-loaded FAQ data for quick responses
- **Real-time Logging**: Query logging and analytics
- **Responsive UI**: Modern React frontend with Vite
- **Production Ready**: Configured for Render deployment

## 📋 Tech Stack

### Backend

- **Framework**: Flask + Flask-CORS
- **AI/ML**:
  - Google Generative AI (Gemini)
  - Sentence Transformers (semantic search)
  - NumPy (data processing)
- **Server**: Gunicorn (production)
- **Environment**: Python 3.x with python-dotenv

### Frontend

- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: CSS
- **Linting**: ESLint

## 📁 Project Structure

```
CKP-Engineering-bot/
├── backend/
│   ├── app.py              # Flask application entry point
│   ├── rag_engine.py       # RAG engine implementation
│   ├── config.py           # Configuration management
│   ├── utils.py            # Utility functions
│   ├── requirements.txt    # Python dependencies
│   ├── dataset.json        # Knowledge base dataset
│   ├── faq_data.json       # FAQ data
│   └── logs/               # Query logs
├── frontend/
│   ├── src/
│   │   ├── CKPCETchatbot.jsx  # Main chatbot component
│   │   ├── main.jsx           # React entry point
│   │   ├── App.css            # Application styles
│   │   └── index.css          # Global styles
│   ├── package.json        # Node dependencies
│   ├── vite.config.js      # Vite configuration
│   └── index.html          # HTML template
├── Procfile                # Render deployment config
└── render.yaml             # Render service definition
```

## 🔧 Setup & Installation

### Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup

1. **Navigate to backend directory**

   ```bash
   cd backend
   ```

2. **Create and activate virtual environment** (recommended)

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Python dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Create `.env` file** with API keys
   ```bash
   cp .env.template .env
   ```
   Add your API keys:
   ```
   GEMINI_API_KEY=your_gemini_key_here
   OPENAI_API_KEY=your_openai_key_here
   ```

### Frontend Setup

1. **Navigate to frontend directory**

   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## 🏃 Running the Application

### Development Mode

**Terminal 1 - Backend**

```bash
cd backend
python app.py
# Runs on http://localhost:5000
```

**Terminal 2 - Frontend**

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

### Production Build

**Build frontend**

```bash
cd frontend
npm run build
```

**Run with Gunicorn**

```bash
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## 🔌 API Endpoints

### Chat Endpoint

- **POST** `/chat`
  - **Body**: `{ "message": "Your question here" }`
  - **Response**:
    ```json
    {
      "response": "AI-generated answer",
      "sources": ["reference_1", "reference_2"],
      "query_id": "uuid"
    }
    ```

### Frontend Routes

- **GET** `/` - Main chatbot interface
- **Static files** served from React build output

## 📝 Environment Variables

Create a `.env` file in the `backend/` directory:

```env
GEMINI_API_KEY=your_google_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
FLASK_ENV=production
```

## 🚀 Deployment

### Render Deployment

The project is pre-configured for Render with:

- `render.yaml` - Service definition
- `Procfile` - Process configuration

**Deploy steps:**

1. Push to GitHub
2. Connect repository to Render
3. Render automatically deploys based on `render.yaml` configuration

## 📊 Logging & Analytics

Query logs are stored in `backend/logs/queries.log` with:

- Query ID (UUID)
- User query
- AI response
- Timestamp
- Performance metrics

## 🔍 How RAG Works

1. **Query Input**: User sends a question
2. **Semantic Search**: Sentence transformers find relevant documents from knowledge base
3. **Context Retrieval**: Top matching documents are retrieved
4. **Generation**: Google Gemini generates response using retrieved context
5. **Response**: Answer is sent back with source references

## 📚 Knowledge Base

- `dataset.json` - Main knowledge base documents
- `faq_data.json` - Frequently asked questions
- Both files are loaded at startup for semantic indexing

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test both backend and frontend
4. Push and create a pull request

## 📄 License

[Add your license here]

## 📞 Support

For issues or questions, please create an issue in the repository.
