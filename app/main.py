import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from contextlib import asynccontextmanager
from starlette.middleware.cors import CORSMiddleware
from app.core.rag import EmbeddingManager, VectorStore, RAGRetriever, GeminiLLM, RAGService
from app.api.upload import upload_router, initialize_temp_rag_router # 👈 New Imports
from app.models.schemas import QueryRequest, RAGResponse, SimpleRAGResponse
from starlette.middleware.cors import CORSMiddleware 



allowed_origins = [
    "http://localhost:5173",  # 👈 Vite Dev Server का डिफ़ॉल्ट पोर्ट
    "http://127.0.0.1:5173",
    # ... (अगर आपने कोई अन्य localhhost:3000 रखा है तो उसे भी रखें)
]

# 1. Load Environment Variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "data/vector_store")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "study_buddy_docs")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
GENERATION_MODEL_NAME = os.getenv("GENERATION_MODEL_NAME", "gemini-2.5-flash")

# Global RAG Service object
rag_service: RAGService = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and Shutdown events for the FastAPI application.
    Initializes RAG components when the server starts.
    """
    print("\n--- FastAPI Startup: Initializing RAG Components ---")
    
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set. Cannot start server.")

    global rag_service
    
    try:
        # Initialize Core Components
        embedding_manager = EmbeddingManager(model_name=EMBEDDING_MODEL_NAME)
        vector_store = VectorStore(
            collection_name=CHROMA_COLLECTION_NAME, 
            persist_directory=VECTOR_STORE_PATH
        )
        if vector_store.get_count() == 0:
            print("WARNING: Vector Store is empty. Please run 'python initialize_db.py' first.")

        retriever = RAGRetriever(vector_store, embedding_manager)
        llm_client = GeminiLLM(model_name=GENERATION_MODEL_NAME, api_key=GEMINI_API_KEY)
        
        # Initialize the main RAG Service
        rag_service = RAGService(vector_store, retriever, llm_client)
        
        # 🚨 NEW STEP: Initialize the Temporary RAG Manager with the main service
        initialize_temp_rag_router(rag_service) 
        
        print("--- RAG Service is READY ---")
        
    except Exception as e:
        print(f"FATAL ERROR during RAG initialization: {e}")
    
    yield
    print("--- FastAPI Shutdown Complete ---")

app = FastAPI(
    title="Study Buddy RAG API",
    description="Retrieval-Augmented Generation API for study materials using FastAPI and Gemini.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CORS Middleware (Crucial for frontend connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 🚨 NEW STEP: Add the new router for upload and temporary queries
app.include_router(upload_router, prefix="/rag") 


# --- API 1: Health Check ---
@app.get("/", tags=["Health"])
def read_root():
    return {"message": "Study Buddy RAG API is running!"}

# --- API 2: Main RAG Query (Answer Only) ---
@app.post("/rag/query", response_model=SimpleRAGResponse, status_code=status.HTTP_200_OK, tags=["RAG"])
async def query_study_buddy(request: QueryRequest):
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
    try:
        result = rag_service.query_rag(query=request.query, top_k=request.top_k)
        return {"query": result["query"], "answer": result["answer"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating answer: {str(e)}")

# --- API 3: Retrieval Only (Get Context) ---
@app.post("/rag/context", response_model=RAGResponse, status_code=status.HTTP_200_OK, tags=["RAG"])
async def retrieve_context_only(request: QueryRequest):
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
    try:
        result = rag_service.query_rag(query=request.query, top_k=request.top_k)
        return result 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving context: {str(e)}")

# --- API 4: Streaming RAG Query (Assuming streaming function is in rag.py) ---
# NOTE: The implementation of this is skipped here to keep main.py clean, 
# but it exists in the prior conversation.
# If you need it, ensure the StreamingResponse logic is restored here or in a separate file.

# --- API 5: System Status / Health Check ---
@app.get("/info/status", tags=["Info"])
def get_system_status():
    if rag_service is None:
        return {"status": "Starting Up/Uninitialized", "documents_loaded": 0, "error": True}
    
    try:
        doc_count = rag_service.vector_store.get_count()
        return {
            "status": "Ready",
            "documents_loaded": doc_count,
            "embedding_model": rag_service.retriever.embedding_manager.model_name,
            "generation_model": rag_service.llm.model_name
        }
    except Exception:
        return {"status": "Error", "documents_loaded": 0, "error": True}
