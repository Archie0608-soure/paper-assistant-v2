#!/usr/bin/env python3
"""
Human Academic Paper Preprocessor
Cleans and chunks 99 human-written academic papers for LLM fine-tuning.
Usage: python 02_preprocess.py
"""

import os
import re
import json
from pathlib import Path

TEXT_DIR = Path(__file__).parent / "human_papers" / "text"
OUTPUT_DIR = Path(__file__).parent / "processed"
OUTPUT_DIR.mkdir(exist_ok=True)

# Sections to remove from papers
REMOVE_PATTERNS = [
    r"分类号[^\n]*",
    r"密级[^\n]*",
    r"单位代码[^\n]*",
    r"学号[^\n]*",
    r"硕士学位论文",
    r"博士学位论文",
    r"作者简历",
    r"致\s*谢",
    r"参考文献",
    r"参考\s*文献",
    r"附录[^\n]*",
    r"作者简历",
    r"\f",  # form feed
]

# Title/author patterns
SKIP_IF_STARTSWITH = [
    "图目录",
    "表目录", 
    "目录",
    "摘要",
    "ABSTRACT",
]

CHUNK_SIZE = 512  # tokens per chunk (approx)
CHUNK_OVERLAP = 64  # overlap between chunks


def clean_text(text: str) -> str:
    """Remove noise from paper text."""
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    
    # Remove PDF artifacts
    text = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", text)
    
    # Remove page markers
    text = re.sub(r"---\s*\d+\s*---", "", text)
    text = re.sub(r"第\s*\d+\s*页", "", text)
    text = re.sub(r"第\s*[一二三四五六七八九十]+章", "", text)
    
    # Remove patterns
    for pattern in REMOVE_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
    
    # Remove multiple newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    
    return text.strip()


def is_gibberish(text: str) -> bool:
    """Check if text is mostly garbage (PDF extraction artifacts)."""
    if len(text) < 50:
        return True
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    total_chars = len(text.replace(" ", ""))
    if total_chars == 0:
        return True
    # If less than 30% Chinese chars, likely garbage
    if total_chars > 20 and chinese_chars / total_chars < 0.15:
        return True
    return False


def split_into_chunks(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    # Simple character-based chunking (approximates token chunking)
    chars_per_chunk = chunk_size * 2  # rough approximation: 1 token ≈ 2 chars for Chinese
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chars_per_chunk
        chunk = text[start:end]
        
        # Try to break at sentence end
        if end < len(text):
            sentence_end = re.search(r'[。！？；\n](?=[^。！？；\n])', chunk[-(chars_per_chunk//4):])
            if sentence_end:
                end = start + chars_per_chunk - (chars_per_chunk//4) + sentence_end.end()
                chunk = text[start:end]
        
        chunk = chunk.strip()
        if len(chunk) > 100 and not is_gibberish(chunk):
            chunks.append(chunk)
        
        start = end - overlap if end < len(text) else len(text)
    
    return chunks


def process_paper(filepath: Path) -> dict:
    """Process a single paper file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()
    except Exception as e:
        return {"error": str(e), "file": str(filepath)}
    
    # Skip if looks like gibberish
    if is_gibberish(text):
        return {"error": "gibberish", "file": str(filepath), "chars": len(text)}
    
    # Clean
    cleaned = clean_text(text)
    
    # Check for skip patterns at beginning
    for skip in SKIP_IF_STARTSWITH:
        if cleaned.startswith(skip):
            return {"error": "starts_with_skip", "file": str(filepath)}
    
    # Split into chunks
    chunks = split_into_chunks(cleaned)
    
    if not chunks:
        return {"error": "no_chunks", "file": str(filepath)}
    
    return {
        "file": filepath.name,
        "chars": len(cleaned),
        "num_chunks": len(chunks),
        "chunks": chunks,
    }


def main():
    files = sorted(TEXT_DIR.glob("*.txt"))
    print(f"Processing {len(files)} files...")
    
    all_chunks = []
    stats = {"total": len(files), "ok": 0, "errors": []}
    
    for i, filepath in enumerate(files):
        result = process_paper(filepath)
        
        if "error" in result:
            stats["errors"].append({"file": filepath.name, "error": result["error"]})
            print(f"  [{i+1}/{len(files)}] ✗ {filepath.name}: {result['error']}")
        else:
            all_chunks.extend(result["chunks"])
            stats["ok"] += 1
            print(f"  [{i+1}/{len(files)}] ✓ {filepath.name}: {result['num_chunks']} chunks ({result['chars']} chars)")
    
    # Save chunks as JSONL
    output_path = OUTPUT_DIR / "train_chunks.jsonl"
    with open(output_path, "w", encoding="utf-8") as f:
        for chunk in all_chunks:
            f.write(json.dumps({"text": chunk}, ensure_ascii=False) + "\n")
    
    print(f"\n✅ Done!")
    print(f"   Processed: {stats['ok']}/{stats['total']} files")
    print(f"   Total chunks: {len(all_chunks)}")
    print(f"   Errors: {len(stats['errors'])}")
    print(f"   Output: {output_path}")
    
    if stats["errors"]:
        print(f"\nErrors:")
        for e in stats["errors"][:10]:
            print(f"   - {e['file']}: {e['error']}")


if __name__ == "__main__":
    main()
