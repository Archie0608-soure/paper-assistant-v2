#!/usr/bin/env python3
"""
Generate paired training data:
- Human paper text -> AI-written academic style version
Uses SiliconFlow API (free tier) with Qwen2.5-72B-Instruct
"""

import os
import json
import glob
from pathlib import Path
from tqdm import tqdm
import requests

# ─── Config ────────────────────────────────────────────────────────────────

SILICONFLOW_API_KEY = os.environ.get("SILICONFLOW_API_KEY", "")
BASE_URL = "https://api.siliconflow.cn/v1/chat/completions"

DATA_DIR = Path(__file__).parent / "human_papers"
OUTPUT_FILE = Path(__file__).parent / "processed" / "paired_data.jsonl"
CHUNK_SIZE = 500  # characters per chunk for pairing

# ─── Load text files ────────────────────────────────────────────────────────

def load_papers(data_dir):
    """Load all .txt files from human_papers directory."""
    txt_files = list(data_dir.glob("*.txt"))
    papers = []
    for f in txt_files:
        try:
            text = f.read_text(encoding="utf-8").strip()
            if len(text) > 200:
                papers.append({"filename": f.stem, "text": text})
        except Exception as e:
            print(f"Error reading {f}: {e}")
    return papers

# ─── Split text into chunks ─────────────────────────────────────────────────

def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=50):
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks

# ─── Generate AI version via API ───────────────────────────────────────────

def generate_ai_version(human_text, api_key):
    """Use Qwen2.5-72B to rewrite human text as typical AI academic style."""
    
    prompt = f"""请将以下人类撰写的学术论文段落，**重写**为典型的AI生成学术风格。

要求：
1. 保持原意、专业术语、核心论点完全不变
2. 改写成"AI批量生成的学术论文"的风格
3. AI风格特征：句式工整、用词正式、逻辑衔接明显、过度解释、重复强调
4. 保持相近的长度

原文（人类写作）：
{human_text}

AI重写版本："""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "Qwen/Qwen2.5-72B-Instruct",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 1024
    }
    
    try:
        resp = requests.post(BASE_URL, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"API error: {e}")
        return None

# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    if not SILICONFLOW_API_KEY:
        print("❌ Please set SILICONFLOW_API_KEY environment variable")
        print("   Get free key at: https://cloud.siliconflow.cn/")
        return
    
    print("📚 Loading papers...")
    papers = load_papers(DATA_DIR)
    print(f"   Found {len(papers)} papers")
    
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for paper in tqdm(papers, desc="Processing papers"):
            chunks = chunk_text(paper["text"])
            
            for i, chunk in enumerate(chunks):
                # Generate AI version
                ai_version = generate_ai_version(chunk, SILICONFLOW_API_KEY)
                if ai_version is None:
                    continue
                
                # Write paired record
                record = {
                    "human": chunk,
                    "ai": ai_version,
                    "source": paper["filename"],
                    "chunk_id": i
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                
                # Rate limiting - sleep between calls
                import time
                time.sleep(0.5)
    
    print(f"✅ Paired data saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()