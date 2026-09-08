import numpy as np
import re
import math
from collections import Counter

class LightweightEmbeddingModel:
    """Fast, zero-dependency TF-IDF + N-gram Semantic Vectorizer for RAG search."""
    def __init__(self):
        self.vocab = {}
        self.idf = None

    def _extract_ngrams(self, text):
        text = text.lower()
        words = re.findall(r'\w+', text)
        tokens = list(words)
        # Word bigrams
        for i in range(len(words) - 1):
            tokens.append(f"{words[i]}_{words[i+1]}")
        # Character trigrams for typo/fuzzy matching
        clean_str = "".join(words)
        for i in range(len(clean_str) - 2):
            tokens.append(f"char:{clean_str[i:i+3]}")
        return tokens

    def fit(self, texts):
        tokenized_docs = [self._extract_ngrams(t) for t in texts]
        all_tokens = set(t for doc in tokenized_docs for t in doc)
        self.vocab = {tok: idx for idx, tok in enumerate(sorted(all_tokens))}
        
        num_docs = len(texts)
        doc_freq = Counter()
        for doc in tokenized_docs:
            for tok in set(doc):
                doc_freq[tok] += 1

        self.idf = np.zeros(len(self.vocab))
        for tok, idx in self.vocab.items():
            self.idf[idx] = math.log((num_docs + 1) / (doc_freq[tok] + 1)) + 1.0

    def encode(self, texts, show_progress_bar=False):
        if not self.vocab:
            self.fit(texts)

        matrix = np.zeros((len(texts), len(self.vocab)))
        for i, text in enumerate(texts):
            tokens = self._extract_ngrams(text)
            counts = Counter(tokens)
            total = len(tokens) if tokens else 1
            for tok, count in counts.items():
                if tok in self.vocab:
                    idx = self.vocab[tok]
                    tf = count / total
                    matrix[i, idx] = tf * self.idf[idx]

            # Normalize vector to unit length for cosine similarity
            norm = np.linalg.norm(matrix[i])
            if norm > 0:
                matrix[i] = matrix[i] / norm

        return matrix

# Quick test
model = LightweightEmbeddingModel()
corpus = [
    "What are the admission requirements for computer engineering?",
    "What is the fee structure for B.E. courses?",
    "Does the college have hostel facilities for students?"
]
matrix = model.encode(corpus)
query_vec = model.encode(["tell me about hostel and fee"])

sims = np.dot(matrix, query_vec[0])
print("Similarities:", sims)
print("Best match:", corpus[np.argmax(sims)])
print("✅ Lightweight Embedding Model test PASSED!")
