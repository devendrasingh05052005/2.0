from pydantic import BaseModel
from typing import List, Dict, Any

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