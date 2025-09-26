from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import datetime

# Input model for the API
class QueryRequest(BaseModel):
    query: str
    top_k: int = 5 # Number of chunks to retrieve

# Output models
class DocumentChunk(BaseModel):
    id: str
    content: str
    metadata: Dict[str, Any]
    similarity_score: float
    rank: int

class RAGResponse(BaseModel):
    query: str
    answer: str
    retrieved_documents: List[DocumentChunk]

class SimpleRAGResponse(BaseModel):
    query: str
    answer: str


class Question(BaseModel):
    question: str
    difficulty: str

class MockTestRequest(BaseModel):
    topic: str
    num_questions: int
    difficulty_level: str
    source_context: Optional[str] = None # Optional context for generation

class MockTestResponse(BaseModel):
    topic: str
    difficulty: str
    total_questions: int
    questions: List[Question]
    generated_at: datetime.datetime

class GlobalChatRequest(BaseModel):
    """Schema for the general knowledge chatbot input."""
    message: str

class GlobalChatResponse(BaseModel):
    """Schema for the general knowledge chatbot output."""
    response: str
    model: str
