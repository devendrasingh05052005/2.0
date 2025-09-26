import os
from pathlib import Path
from typing import List, Any
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

class DataProcessor:
    """Handles loading and splitting documents from a directory."""

    def __init__(self, pdf_directory: str):
        self.pdf_directory = pdf_directory

    def process_all_pdfs(self) -> List[Any]:
        """Loads and processes all PDF files in the specified directory."""
        all_documents = []
        pdf_dir = Path(self.pdf_directory)
        pdf_files = list(pdf_dir.glob("**/*.pdf"))
        
        print(f"--- DataProcessor: Found {len(pdf_files)} PDF files to process in {self.pdf_directory}")
        
        for pdf_file in pdf_files:
            try:
                # Use PyPDFLoader as per your original code
                loader = PyPDFLoader(str(pdf_file))
                documents = loader.load()
                
                for doc in documents:
                    doc.metadata['source_file'] = pdf_file.name
                    doc.metadata['file_type'] = 'pdf'
                
                all_documents.extend(documents)
                print(f"  ✓ Loaded {len(documents)} pages from: {pdf_file.name}")
            except Exception as e:
                print(f"  ✗ Error loading {pdf_file.name}: {e}")
        
        print(f"--- DataProcessor: Total documents loaded: {len(all_documents)}")
        return all_documents

    def split_documents(self, documents: List[Any], chunk_size: int = 1000, chunk_overlap: int = 200) -> List[Any]:
        """Splits documents into smaller chunks."""
        if not documents:
            return []
            
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        split_docs = text_splitter.split_documents(documents)
        print(f"--- DataProcessor: Split {len(documents)} documents into {len(split_docs)} chunks")
        return split_docs

# Note: This file contains the logic. Data loading and splitting will be executed 
# in the 'initialize_db.py' script.