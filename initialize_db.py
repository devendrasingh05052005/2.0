import os
from dotenv import load_dotenv
import numpy as np
from app.core.data_prep import DataProcessor
from app.core.rag import EmbeddingManager, VectorStore

# 1. Load Environment Variables
load_dotenv()
PDF_DIRECTORY = os.getenv("PDF_DIRECTORY", "data/pdfs")
VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "data/vector_store")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "study_buddy_docs")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")

def setup_rag_database():
    """Performs the document loading, splitting, embedding, and storage."""
    print("\n--- RAG Database Setup Initiated ---")
    
    # 1. Data Processing
    data_processor = DataProcessor(pdf_directory=PDF_DIRECTORY)
    all_pdf_documents = data_processor.process_all_pdfs()
    
    if not all_pdf_documents:
        print("No documents loaded. Database setup aborted.")
        return

    # 2. Text Splitting
    chunks = data_processor.split_documents(all_pdf_documents, chunk_size=1000, chunk_overlap=200)
    texts = [doc.page_content for doc in chunks]
    
    # 3. Embedding Generation
    try:
        embedding_manager = EmbeddingManager(model_name=EMBEDDING_MODEL_NAME)
        embeddings = embedding_manager.generate_embeddings(texts)
    except Exception as e:
        print(f"Failed to generate embeddings: {e}")
        return

    # 4. Vector Store Initialization and Addition
    try:
        # NOTE: We clear the old database before adding new docs
        # If you want to append, you can remove the next two lines 
        import shutil
        if os.path.exists(VECTOR_STORE_PATH):
            shutil.rmtree(VECTOR_STORE_PATH) 
        
        vector_store = VectorStore(
            collection_name=CHROMA_COLLECTION_NAME, 
            persist_directory=VECTOR_STORE_PATH
        )
        vector_store.add_documents(chunks, embeddings)
        
    except Exception as e:
        print(f"Failed to initialize or add documents to VectorStore: {e}")
        return

    print("--- RAG Database Setup Complete ---")

if __name__ == "__main__":
    setup_rag_database()