import os
import numpy as np
import uuid
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer
import chromadb
import google.genai as genai
from langchain.prompts import PromptTemplate

# --- 1. Embedding Manager (from your code) ---
class EmbeddingManager:
    def __init__(self, model_name: str):
        self.model_name = model_name
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            print(f"--- EmbeddingManager: Loading model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            dim = self.model.get_sentence_embedding_dimension()
            print(f"--- EmbeddingManager: Model loaded. Dim: {dim}")
        except Exception as e:
            print(f"--- EmbeddingManager: Error loading model {self.model_name}: {e}")
            raise

    def generate_embeddings(self, texts: List[str]) -> np.ndarray:
        if not self.model:
            raise ValueError("Model not loaded")
        # Print is removed for cleaner API output, but kept for init
        embeddings = self.model.encode(texts)
        return embeddings

# --- 2. Vector Store (from your code) ---
class VectorStore:
    def __init__(self, collection_name: str, persist_directory: str):
        self.collection_name = collection_name
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        self._initialize_store()

    def _initialize_store(self):
        try:
            os.makedirs(self.persist_directory, exist_ok=True)
            self.client = chromadb.PersistentClient(path=self.persist_directory)
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "PDF document embeddings for RAG"}
            )
            print(f"--- VectorStore: Initialized. Collection: {self.collection_name}. Docs: {self.collection.count()}")
        except Exception as e:
            print(f"--- VectorStore: Error initializing store: {e}")
            raise

    def add_documents(self, documents: List[Any], embeddings: np.ndarray):
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents must match number of embeddings")
        
        # ... (Your document preparation logic remains the same) ...
        ids, metadatas, documents_text, embeddings_list = [], [], [], []
        for i, (doc, embedding) in enumerate(zip(documents, embeddings)):
            doc_id = f"doc_{uuid.uuid4().hex[:8]}_{i}"
            ids.append(doc_id)
            metadata = dict(doc.metadata)
            metadata['doc_index'] = i
            metadatas.append(metadata)
            documents_text.append(doc.page_content)
            embeddings_list.append(embedding.tolist())
        
        try:
            self.collection.add(
                ids=ids,
                embeddings=embeddings_list,
                metadatas=metadatas,
                documents=documents_text
            )
            print(f"--- VectorStore: Successfully added {len(documents)} documents. Total: {self.collection.count()}")
        except Exception as e:
            print(f"--- VectorStore: Error adding documents: {e}")
            raise

    def get_count(self):
        return self.collection.count()

# --- 3. RAG Retriever (from your code) ---
class RAGRetriever:
    def __init__(self, vector_store: VectorStore, embedding_manager: EmbeddingManager):
        self.vector_store = vector_store
        self.embedding_manager = embedding_manager

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        query_embedding = self.embedding_manager.generate_embeddings([query])[0]
        
        try:
            results = self.vector_store.collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=top_k,
                include=['documents', 'metadatas', 'distances']
            )
            
            retrieved_docs = []
            
            if results['documents'] and results['documents'][0]:
                documents = results['documents'][0]
                metadatas = results['metadatas'][0]
                distances = results['distances'][0]
                ids = results['ids'][0]
                
                for i, (doc_id, document, metadata, distance) in enumerate(zip(ids, documents, metadatas, distances)):
                    similarity_score = 1 - distance # Convert distance to similarity score
                    retrieved_docs.append({
                        'id': doc_id,
                        'content': document,
                        'metadata': metadata,
                        'similarity_score': similarity_score,
                        'rank': i + 1
                    })
            
            return retrieved_docs
            
        except Exception as e:
            print(f"--- RAGRetriever: Error during retrieval: {e}")
            return []

# --- 4. Gemini LLM (adapted from your code) ---
class GeminiLLM:
    def __init__(self, model_name: str, api_key: str):
        if not api_key:
            raise ValueError("Gemini API key is required.")
        
        self.model_name = model_name
        self.client = genai.Client(api_key=api_key)
        print(f"--- GeminiLLM: Initialized with model: {self.model_name}")

    def generate_rag_response(self, query: str, context: str) -> str:
        prompt_template = PromptTemplate(
            input_variables=["context", "question"],
            template="""You are a helpful Study Buddy AI assistant. Use the following context to answer the question accurately and concisely.

Context:
{context}

Question: {question}

Answer: Provide a clear and informative answer based ONLY on the context above. If the context doesn't contain enough information to answer the question, politely say, 'I'm sorry, I couldn't find the answer in the provided study materials.'"""
        )
        
        formatted_prompt = prompt_template.format(context=context, question=query)
        
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=formatted_prompt,
                config={
                    "temperature": 0.1,
                    "max_output_tokens": 1024
                }
            )
            return response.text
        except Exception as e:
            print(f"--- GeminiLLM: Error generating response: {e}")
            return f"Error: Could not generate response due to a system error."

# --- 5. Main RAG Service Class ---
class RAGService:
    def __init__(self, vector_store: VectorStore, retriever: RAGRetriever, llm: GeminiLLM):
        self.vector_store = vector_store
        self.retriever = retriever
        self.llm = llm

    def query_rag(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        """Main RAG function to retrieve context and generate an answer."""
        
        # 1. Retrieve Context
        retrieved_docs = self.retriever.retrieve(query, top_k=top_k)
        
        context_parts = [doc['content'] for doc in retrieved_docs]
        context = "\n\n---\n\n".join(context_parts)
        
        if not context:
            return {
                "query": query,
                "answer": "I'm sorry, I couldn't find any relevant study materials for your question.",
                "retrieved_documents": []
            }
        
        # 2. Generate Answer
        answer = self.llm.generate_rag_response(query, context)
        
        return {
            "query": query,
            "answer": answer,
            "retrieved_documents": retrieved_docs
        }