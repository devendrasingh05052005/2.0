import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.rag import EmbeddingManager, VectorStore, RAGRetriever, GeminiLLM, RAGService
from app.api.upload import upload_router, initialize_temp_rag_router
from app.models.schemas import QueryRequest, RAGResponse, SimpleRAGResponse
from app.core.quiz_gen import QuizGenerator

# Load environment
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "data/vector_store")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "study_buddy_docs")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
GENERATION_MODEL_NAME = os.getenv("GENERATION_MODEL_NAME", "gemini-2.5-flash")

# Global objects
rag_service: RAGService = None
quiz_generator: QuizGenerator = None

# Allowed frontend origins
allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

# FastAPI lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag_service, quiz_generator

    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not set. Cannot start server.")

    print("--- Initializing RAG Components ---")
    embedding_manager = EmbeddingManager(model_name=EMBEDDING_MODEL_NAME)
    vector_store = VectorStore(
        collection_name=CHROMA_COLLECTION_NAME,
        persist_directory=VECTOR_STORE_PATH
    )
    retriever = RAGRetriever(vector_store, embedding_manager)
    llm_client = GeminiLLM(model_name=GENERATION_MODEL_NAME, api_key=GEMINI_API_KEY)
    rag_service = RAGService(vector_store, retriever, llm_client)
    quiz_generator = QuizGenerator(retriever=retriever, llm=llm_client)

    initialize_temp_rag_router(rag_service)  # optional
    yield
    print("--- FastAPI Shutdown Complete ---")


# FastAPI app
app = FastAPI(title="Study Buddy RAG API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=[""], allow_headers=[""])
app.include_router(upload_router, prefix="/rag")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

# Pydantic model for quiz request
class QuizRequest(BaseModel):
    topic: str
    num_questions: int = 5

# Health check
@app.get("/", tags=["Health"])
def read_root():
    return {"message": "Study Buddy RAG API is running!"}

# RAG query endpoint
@app.post("/rag/query", response_model=SimpleRAGResponse, status_code=status.HTTP_200_OK)
async def query_study_buddy(request: QueryRequest):
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
    try:
        result = rag_service.query_rag(query=request.query, top_k=request.top_k)
        return {"query": result["query"], "answer": result["answer"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Quiz endpoint
@app.post("/generate-quiz", tags=["Quiz"])
async def generate_quiz_endpoint(request: QuizRequest):
    if quiz_generator is None:
        raise HTTPException(status_code=503, detail="Quiz Generator not initialized.")
    try:
        quiz_json = quiz_generator.generate_quiz_json(request.topic, request.num_questions)
        return quiz_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Retrieval only
@app.post("/rag/context", response_model=RAGResponse)
async def retrieve_context_only(request: QueryRequest):
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
    try:
        result = rag_service.query_rag(query=request.query, top_k=request.top_k)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# System status
@app.get("/info/status", tags=["Info"])
def get_system_status():
    if rag_service is None:
        return {"status": "Starting Up/Uninitialized", "documents_loaded": 0, "error": True}
    try:
        return {
            "status": "Ready",
            "documents_loaded": rag_service.vector_store.get_count(),
            "embedding_model": rag_service.retriever.embedding_manager.model_name,
            "generation_model": rag_service.llm.model_name
        }
    except Exception:
        return {"status": "Error", "documents_loaded": 0, "error": True}