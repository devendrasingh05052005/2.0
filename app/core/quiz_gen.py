import json
import re
from typing import List, Dict, Any
from app.core.rag import RAGRetriever, GeminiLLM


class QuizGenerator:
    """
    Generates MCQs using a RAGRetriever and GeminiLLM.
    """
    def __init__(self, retriever: RAGRetriever, llm: GeminiLLM):
        self.retriever = retriever
        self.llm = llm
        print("--- QuizGenerator Initialized ---")

    def _create_prompt(self, context: str, num_questions: int) -> str:
        return f"""
        You are an expert Question Setter AI for the GATE exam.
        Create {num_questions} multiple-choice questions (MCQs) ONLY from the provided context.

        CONTEXT:
        "{context}"

        Instructions:
        1. Each question must have 4 options: A, B, C, D.
        2. Exactly 1 option is correct.
        3. Provide a concise explanation for each correct answer.
        4. Output must be a JSON array of {num_questions} objects:

        [
          {{
            "question": "...",
            "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
            "correct_answer": "A",
            "explanation": "..."
          }},
          ...
        ]
        """

    def _extract_json(self, text: str) -> Any:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\[.*\]", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    return None
            return None

    def generate_quiz_json(self, topic: str, num_questions: int = 5) -> List[Dict[str, Any]]:
        print(f"\n--- QuizGenerator: Generating {num_questions} question(s) for topic: '{topic}'")

        # Retrieve a single document
        retrieved_docs = self.retriever.retrieve(topic, top_k=1)
        if not retrieved_docs:
            print(f"--- No context found for topic '{topic}'")
            return []

        context = retrieved_docs[0]['content']
        prompt = self._create_prompt(context, num_questions)

        try:
            # Use Gemini client
            response = self.llm.client.models.generate_content(
                model=self.llm.model_name,
                contents=prompt,
                config={
                    "temperature": 0.4,
                    "response_mime_type": "application/json"
                }
            )
            response_text = response.text.strip()
            mcq_list = self._extract_json(response_text)
            if mcq_list and isinstance(mcq_list, list):
                print(f"--- Successfully generated {len(mcq_list)} questions.")
                return mcq_list
            else:
                print(f"--- Failed to parse JSON. LLM output:\n{response_text}")
                return []

        except Exception as e:
            print(f"--- Error generating quiz: {e}")
            return []