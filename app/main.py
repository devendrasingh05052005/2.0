import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from contextlib import asynccontextmanager
from app.core.rag import EmbeddingManager, VectorStore, RAGRetriever, GeminiLLM, RAGService
from app.models.schemas import QueryRequest, RAGResponse, SimpleRAGResponse 
from starlette.middleware.cors import CORSMiddleware 


allowed_origins = [
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
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
        
        # Check if the Vector Store has data
        if vector_store.get_count() == 0:
            print("WARNING: Vector Store is empty. Please run 'python initialize_db.py' first.")
            # We continue to allow the server to start, but the RAG will fail if queried.

        retriever = RAGRetriever(vector_store, embedding_manager)
        llm_client = GeminiLLM(model_name=GENERATION_MODEL_NAME, api_key=GEMINI_API_KEY)
        
        # Initialize the main RAG Service
        rag_service = RAGService(vector_store, retriever, llm_client)
        print("--- RAG Service is READY ---")
        
    except Exception as e:
        print(f"FATAL ERROR during RAG initialization: {e}")
        # In a real app, you might want to raise here or use logging
    
    yield
    # Shutdown logic (nothing needed for these components, but good practice)
    print("--- FastAPI Shutdown Complete ---")

app = FastAPI(
    title="Study Buddy RAG API",
    description="Retrieval-Augmented Generation API for study materials using FastAPI and Gemini.",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/", tags=["Health"])
def read_root():
    """Simple health check."""
    return {"message": "Study Buddy RAG API is running!"}

@app.post("/query", response_model=SimpleRAGResponse, status_code=status.HTTP_200_OK, tags=["RAG"])
async def query_study_buddy(request: QueryRequest):
    """
    Endpoint to process a user query using the RAG system.
    """
    if rag_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG Service is not initialized. Check server logs."
        )

    print(f"\nAPI Query received: {request.query}")
    
    try:
        # Call the RAG Service
        result = rag_service.query_rag(query=request.query, top_k=request.top_k)
        
        # FIX 3: केवल SimpleRAGResponse के फ़ील्ड्स रिटर्न करें
        return {
            "query": result["query"],
            "answer": result["answer"]
        }
        
    except Exception as e:
        print(f"Error processing query: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while generating the answer: {str(e)}"
        )
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)