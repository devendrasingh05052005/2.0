import os
from typing import Dict, Any, List
import chromadb
from chromadb.api.models.Collection import Collection as ChromaCollection
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from app.core.rag import RAGService
from app.core.data_prep import DataProcessor # Import DataProcessor from its dedicated file


# In-memory dictionary to hold temporary vector stores
# Key: Session ID (or a simple 'temp_session')
# Value: A dictionary containing {'collection': ChromaCollection object, 'chunk_count': int}
TEMP_STORE: Dict[str, Dict[str, Any]] = {} 

class TemporaryRAGManager:
    """
    Handles indexing and querying for documents that are temporarily stored 
    in RAM (using in-memory ChromaDB). This data is lost when the server restarts.
    """
    
    def __init__(self, rag_service: RAGService):
        self.rag_service = rag_service
        self.processor = DataProcessor(pdf_directory="") # Dummy path, as we use temp files
        
    def index_temporary_data(self, file_content: bytes, file_name: str, session_key: str = "temp_session"):
        """
        Processes file content and indexes it into a new in-memory vector store 
        identified by session_key.
        """
        
        # 1. फ़ाइल को डिस्क पर अस्थायी रूप से सेव करें (क्योंकि PyPDFLoader को फ़ाइल पाथ चाहिए)
        temp_dir = os.path.join(os.getcwd(), 'temp_uploads')
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, file_name)
        
        with open(temp_path, "wb") as f:
            f.write(file_content)

        chunks: List[Any] = []
        
        try:
            # 2. Document Loading, Splitting
            loader = PyPDFLoader(temp_path)
            documents = loader.load()
            
            for doc in documents:
                doc.metadata['source_file'] = file_name
                doc.metadata['is_temp'] = True
            
            # Simple chunking for temporary data
            chunks = self.processor.split_documents(documents, chunk_size=500, chunk_overlap=100)
            
            if not chunks:
                raise ValueError("No content extracted from the document.")

            texts = [doc.page_content for doc in chunks]
            
            # 3. Embedding Generate करें (Main Embedding Manager का उपयोग करके)
            embeddings = self.rag_service.retriever.embedding_manager.generate_embeddings(texts)
            
            # 4. In-Memory ChromaDB क्लाइंट (EphemeralClient)
            # EphemeralClient RAM में रखता है
            temp_client = chromadb.Client() 
            temp_collection = temp_client.get_or_create_collection(
                name=f"temp_col_{session_key}"
            )

            # 5. ChromaDB में जोड़ें
            ids, metadatas, documents_text, embeddings_list = [], [], [], []
            for i, (doc, embedding) in enumerate(zip(chunks, embeddings)):
                doc_id = f"temp_{session_key}_{i}"
                ids.append(doc_id)
                metadatas.append(doc.metadata)
                documents_text.append(doc.page_content)
                embeddings_list.append(embedding.tolist())
            
            temp_collection.add(
                ids=ids,
                embeddings=embeddings_list,
                metadatas=metadatas,
                documents=documents_text
            )

            # 6. अस्थायी स्टोर में डेटा सेव करें
            TEMP_STORE[session_key] = {
                "collection": temp_collection,
                "filename": file_name,
                "chunk_count": len(chunks)
            }
            
            return TEMP_STORE[session_key]

        finally:
            # 7. डिस्क से अस्थायी फ़ाइल हटा दें
            if os.path.exists(temp_path):
                os.remove(temp_path)
            # Clean up temp directory if empty (optional)
            try:
                if not os.listdir(temp_dir):
                    os.rmdir(temp_dir)
            except OSError:
                pass # Directory may not be empty

    def query_temporary_data(self, query: str, top_k: int, session_key: str = "temp_session") -> Dict[str, str]:
        """Queries the temporary store and generates an LLM response."""
        
        temp_data = TEMP_STORE.get(session_key)
        if not temp_data:
            return {"answer": None, "source_file": None} # None का मतलब है कि मेन DB से पूछो

        temp_collection: ChromaCollection = temp_data['collection']
        
        # Embedding Manager का उपयोग करके क्वेरी को एम्बेड करें
        query_embedding = self.rag_service.retriever.embedding_manager.generate_embeddings([query])[0]
        
        # अस्थायी कलेक्शन में खोजें
        results = temp_collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=top_k,
            include=['documents', 'metadatas']
        )
        
        context = "\n\n---\n\n".join(results['documents'][0]) if results['documents'] else ""
        

        print("\n[TEMP RAG DEBUG START] ----------------------------------")
        if not context:
            print(f"INFO: Search in TEMP store failed. Retrieved 0 chunks.")
        else:
            print(f"SUCCESS: Retrieved {len(results['documents'][0])} chunks from TEMP store.")
            print("Context Snippet (First 200 chars):", context[:200] + "...")
        print("[TEMP RAG DEBUG END] ------------------------------------\n")

        if not context:
            return {"answer": None, "source_file": None} 

        
        # Gemini LLM से जवाब जनरेट करें (temp context का उपयोग करके)
        answer = self.rag_service.llm.generate_rag_response(query, context)
        
        return {"answer": answer, "source_file": temp_data['filename']}

    def delete_temporary_data(self, session_key: str = "temp_session"):
        """Deletes the temporary vector store."""
        if session_key in TEMP_STORE:
            del TEMP_STORE[session_key]
            print(f"--- TemporaryRAGManager: Temporary store for {session_key} deleted.")
