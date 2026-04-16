#!/usr/bin/env python3
"""
Humanize Inference Script
Loads fine-tuned LoRA adapter from ModelScope and generates humanized academic text.

Usage:
    # Option A: Load from ModelScope (recommended)
    python 05_inference.py --model_scope Archie0608/qwen-humanize
    
    # Option B: Load from local adapter
    python 05_inference.py --local_adapter ./local_adapter
    
    # Option C: Web server (GPU needed)
    python 05_inference.py --server --model_scope Archie0608/qwen-humanize --port 8080
"""

import argparse
import os
import sys
from typing import Optional

# System prompt for human-like academic writing
SYSTEM_PROMPT = """你是一位人文学者，正在撰写学术论文。你的写作风格：
- 句式长短交替，主动被动交替
- 会用犹豫词：可能、大概、笔者认为、似乎
- 不用完美的排比句
- 承认研究的局限性
- 口语化和书面语混合
- 有时会有不完整的句子或思考过程
- 段落之间过渡自然但不公式化
"""

DEFAULT_PROMPT = """请将以下AI生成的论文内容润色，使其更像真人写作，保留所有学术内容：
{ai_text}

润色要求：
- 删除所有完美排比句
- 增加犹豫和不确定性表达（可能、大概、似乎）
- 引入真实思考过程
- 使用口语化和简短句子
- 加入轻微矛盾或修正
- 保持学术严谨性
- 保持原文字数不低于90%
"""


def load_from_modelscope(model_name: str, adapter_name: str):
    """Load base model + LoRA adapter from ModelScope."""
    from modelscope import snapshot_download, AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    
    print(f"📥 Downloading base model from ModelScope...")
    base_dir = snapshot_download('qwen/Qwen2.5-1.5B-Instruct')
    print(f"   Base model: {base_dir}")
    
    print(f"📥 Downloading LoRA adapter: {adapter_name}")
    adapter_dir = snapshot_download(adapter_name)
    print(f"   Adapter: {adapter_dir}")
    
    print(f"🔧 Loading model...")
    tokenizer = AutoTokenizer.from_pretrained(base_dir, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    base_model = AutoModelForCausalLM.from_pretrained(
        base_dir, device_map="auto", torch_dtype=torch.bfloat16, trust_remote_code=True
    )
    model = PeftModel.from_pretrained(base_model, adapter_dir)
    print(f"   Model loaded!")
    
    return model, tokenizer


def load_from_local(adapter_path: str, base_model: str = "qwen/Qwen2.5-1.5B-Instruct"):
    """Load from local adapter files."""
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
    import torch
    
    print(f"🔧 Loading from local: {adapter_path}")
    tokenizer = AutoTokenizer.from_pretrained(adapter_path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    base = AutoModelForCausalLM.from_pretrained(
        adapter_path, device_map="auto", torch_dtype=torch.bfloat16, trust_remote_code=True
    )
    model = PeftModel.from_pretrained(base, f"{adapter_path}/adapter_model.safetensors")
    print(f"   Model loaded!")
    return model, tokenizer


def generate_humanized(model, tokenizer, ai_text: str, max_length: int = 2000) -> str:
    """Generate humanized version of AI text."""
    import torch
    
    prompt = DEFAULT_PROMPT.format(ai_text=ai_text)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_length,
            temperature=0.35,
            top_p=0.9,
            do_sample=True,
            repetition_penalty=1.1,
        )
    
    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return response


def run_server(model_name: str, port: int = 8080):
    """Run as web API server."""
    from fastapi import FastAPI
    import uvicorn
    import torch
    
    app = FastAPI(title="Humanize API")
    
    print("Loading model...")
    model, tokenizer = load_from_modelscope(model_name, model_name)
    
    @app.post("/humanize")
    async def humanize(request: dict):
        ai_text = request.get("text", "")
        result = generate_humanized(model, tokenizer, ai_text)
        return {"result": result}
    
    print(f"🚀 Server running on http://0.0.0.0:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)


def main():
    parser = argparse.ArgumentParser(description="Humanize AI-generated academic text")
    parser.add_argument("--model_scope", help="ModelScope model name (e.g. Archie0608/qwen-humanize)")
    parser.add_argument("--local_adapter", help="Local adapter path")
    parser.add_argument("--text", help="AI text to humanize")
    parser.add_argument("--server", action="store_true", help="Run as API server")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    
    if args.server:
        if not args.model_scope:
            print("Error: --model_scope required for server mode")
            sys.exit(1)
        run_server(args.model_scope, args.port)
        return
    
    # Interactive or single text mode
    if args.text:
        if not args.model_scope and not args.local_adapter:
            print("Error: specify --model_scope or --local_adapter")
            sys.exit(1)
        
        model, tokenizer = load_from_modelscope(args.model_scope, args.model_scope) if args.model_scope else load_from_local(args.local_adapter)
        result = generate_humanized(model, tokenizer, args.text)
        print("\n" + "="*60)
        print("HUMANIZED OUTPUT:")
        print("="*60)
        print(result)
    else:
        print("Humanize Academic Text")
        print("="*60)
        print("Usage:")
        print("  python 05_inference.py --model_scope Archie0608/qwen-humanize --text '...'")
        print("  python 05_inference.py --server --model_scope Archie0608/qwen-humanize")
        print()
        print(f"Model: {args.model_scope or args.local_adapter}")


if __name__ == "__main__":
    main()
