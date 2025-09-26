import os
from fastapi import APIRouter, HTTPException, File, UploadFile, Query, status
from app.core.rag import RAGService
from app.core.data_prep import DataProcessor
from app.core.temp_rag import TemporaryRAGManager
from app.models.schemas import QueryRequest, SimpleRAGResponse
from typing import Dict, Any

# Router instance
upload_router = APIRouter(tags=["RAG - Upload & Temp"])

# The TemporaryRAGManager instance needs to be initialized outside or passed during startup.
# We will initialize it in main.py and pass the instance to this module.
temp_rag_manager: TemporaryRAGManager = None
main_rag_service: RAGService = None

def initialize_temp_rag_router(rag_service_instance: RAGService):
    """Initializes the required managers for the router."""
    global temp_rag_manager, main_rag_service
    main_rag_service = rag_service_instance
    temp_rag_manager = TemporaryRAGManager(rag_service_instance)


# --- API 1: Temporary/Permanent Upload ---
@upload_router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    # save_permanent: Frontend से इस फ़ील्ड को 'true' या 'false' भेजा जाएगा
    save_permanent: bool = Query(False, description="Should this file be permanently saved to the main DB?")
) -> Dict[str, Any]:
    """
    Uploads a document and either indexes it permanently to the main DB or temporarily to RAM.
    """
    if main_rag_service is None or temp_rag_manager is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")

    file_content = await file.read()
    
    if save_permanent:
        # A. PERMANENT SAVE (मौजूदा /info/upload लॉजिक)
        temp_path = os.path.join(os.getenv("PDF_DIRECTORY", "data/pdfs"), file.filename)
        with open(temp_path, "wb") as buffer:
            buffer.write(file_content)

        try:
            # Indexing logic
            processor = DataProcessor(pdf_directory=os.getenv("PDF_DIRECTORY", "data/pdfs"))
            
            # We must load *all* documents to perform the split correctly
            all_documents = processor.process_all_pdfs() 
            chunks = processor.split_documents(all_documents, chunk_size=1000, chunk_overlap=200)
            texts = [doc.page_content for doc in chunks]
            
            # Re-index the entire database (safer method)
            embeddings = main_rag_service.retriever.embedding_manager.generate_embeddings(texts)
            # We rely on initialize_db.py's method to handle updates/clearing for simplicity.
            # For a true API, we would only add the new chunks.
            
            # 🚨 NOTE: For production, you should only add *new* documents. 
            # For simplicity, we assume the main DB is updated by adding new ones.
            main_rag_service.vector_store.add_documents(chunks, embeddings) 
            
            return {
                "status": "Saved Permanently",
                "filename": file.filename,
                "message": "File added to permanent vector store and indexed."
            }

        except Exception as e:
            # Clean up the file if indexing failed
            os.remove(temp_path)
            raise HTTPException(status_code=500, detail=f"Permanent indexing failed: {str(e)}")
        
    else:
        # B. TEMPORARY SAVE (नया लॉजिक)
        try:
            temp_data = temp_rag_manager.index_temporary_data(file_content, file.filename)
            
            return {
                "status": "Indexed Temporarily",
                "filename": temp_data['filename'],
                "chunks_indexed": temp_data['chunk_count'],
                "message": "Data indexed in RAM for temporary session querying."
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Temporary indexing failed: {str(e)}")


# --- API 2: Temporary Query ---
@upload_router.post("/temp_query", response_model=SimpleRAGResponse)
async def query_temp_document(request: QueryRequest) -> SimpleRAGResponse:
    """
    Queries the temporarily indexed document in RAM. 
    If temporary data is not available, it queries the main permanent DB.
    """
    if temp_rag_manager is None or main_rag_service is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
    
    # 1. पहले अस्थायी स्टोर से पूछें
    temp_result = temp_rag_manager.query_temporary_data(request.query, request.top_k)
    
    if temp_result['answer']:
        # 2. अगर अस्थायी डेटा में जवाब मिला
        return SimpleRAGResponse(
            query=request.query,
            answer=f"[Answer from {temp_result['source_file']} (TEMP)]: {temp_result['answer']}"
        )
    
    # 3. अगर अस्थायी स्टोर खाली है या जवाब नहीं मिला, तो Main DB से पूछें
    print("INFO: Temporary store empty/unresponsive. Falling back to main DB query.")
    try:
        main_result = main_rag_service.query_rag(query=request.query, top_k=request.top_k)
        return SimpleRAGResponse(
            query=request.query,
            answer=f"[Answer from Main DB]: {main_result['answer']}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Main DB query failed: {str(e)}")


# --- API 3: Cleanup ---
@upload_router.get("/clear_temp")
def clear_temp_data():
    """Clears the temporary document from RAM."""
    if temp_rag_manager is None:
        raise HTTPException(status_code=503, detail="RAG Service is not initialized.")
        
    temp_rag_manager.delete_temporary_data()
    return {"status": "success", "message": "Temporary RAG store cleared from RAM."}

@upload_router.get("/check_temp_status")
def check_temp_status():
    """Returns the current status of the temporary RAG store in RAM."""
    from app.core.temp_rag import TEMP_STORE # TEMP_STORE को सीधे इम्पोर्ट करें
    
    status_info = {
        "is_active": "temp_session" in TEMP_STORE,
        "filename": TEMP_STORE.get("temp_session", {}).get("filename", "N/A"),
        "chunk_count": TEMP_STORE.get("temp_session", {}).get("chunk_count", 0),
        "keys_in_store": list(TEMP_STORE.keys())
    }
    return status_info