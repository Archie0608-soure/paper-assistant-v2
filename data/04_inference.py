#!/usr/bin/env python3
"""
Inference Script — Use fine-tuned model to generate human-style academic text.
Integrates with the existing paper-assistant app's generate flow.

Usage:
    # Option A: Use MLX (Apple Silicon, recommended)
    pip install mlx mlx-lm
    python 04_inference.py --method mlx --adapter_path ./outputs/final_adapter
    
    # Option B: Use HuggingFace Transformers (any platform)
    pip install transformers peft torch
    python 04_inference.py --method hf --adapter_path ./outputs/final_adapter
    
    # Option C: llama.cpp (no GPU required, CPU inference)
    python 04_inference.py --method llamacpp --model_path ./outputs/final_adapter
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional

# ─── Academic Writing Prompt Templates ─────────────────────────────────────

SYSTEM_PROMPT = """你是一位人文学者，正在撰写一篇学术论文。你的写作风格：
- 句式长短交替，主动被动交替
- 会用犹豫词：可能、大概、笔者认为、似乎
- 不用完美的排比句
- 承认研究的局限性
- 口语化和书面语混合
- 有时会有不完整的句子或思考过程
- 段落之间过渡自然但不公式化
"""

HUMANIZE_PROMPT = """请将以下AI生成的论文内容润色，使其更像真人写作，保留所有学术内容：
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


# ─── Inference Engines ─────────────────────────────────────────────────────

def generate_with_hf(
    prompt: str,
    adapter_path: str,
    base_model: str = "Qwen/Qwen2.5-1.5B-Instruct",
    max_length: int = 2000,
    temperature: float = 0.35,
) -> str:
    """Generate using HuggingFace Transformers + PEFT adapter."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
    from peft import PeftModel
    
    print(f"   Loading base model: {base_model}")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    print(f"   Loading adapter: {adapter_path}")
    base = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, adapter_path)
    model.eval()
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    
    outputs = model.generate(
        **inputs,
        max_new_tokens=max_length,
        temperature=temperature,
        top_p=0.9,
        do_sample=True,
        repetition_penalty=1.1,
    )
    
    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return response


def generate_with_mlx(
    prompt: str,
    adapter_path: str,
    base_model: str = "Qwen/Qwen2.5-1.5B-Instruct",
    max_length: int = 2000,
    temperature: float = 0.35,
) -> str:
    """Generate using MLX (Apple Silicon native)."""
    try:
        from mlx_lm import load, generate
    except ImportError:
        print("   mlx-lm not installed. Run: pip install mlx mlx-lm")
        sys.exit(1)
    
    print(f"   Loading model with MLX: {base_model} + adapter: {adapter_path}")
    model, tokenizer = load(base_model, adapter_path=adapter_path)
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    
    response = generate(
        model,
        tokenizer,
        prompt=text,
        max_tokens=max_length,
        temp=temperature,
        repetition_penalty=1.1,
    )
    return response


def generate_with_llamacpp(
    prompt: str,
    model_path: str,
    max_length: int = 2000,
    temperature: float = 0.35,
) -> str:
    """Generate using llama.cpp (CPU inference)."""
    print("   llama.cpp generation (requires converted model)")
    print(f"   Model path: {model_path}")
    print("""
To use llama.cpp:
1. Convert model to GGUF format:
   python -m transformers.quantizers.auto_quantizer --output_type gguf \
       --quantization_method q4_k_m \
       --output_dir ./outputs/gguf_model \
       ./outputs/final_adapter

2. Run inference:
   ./llama.cpp/main -m ./outputs/gguf_model/model.gguf \
       -p "请写一篇关于...的学术论文第一章引言" \
       --temp 0.35 --ctx 2048 -n 2000
""")
    return ""


# ─── Humanize Existing AI Text ──────────────────────────────────────────────

def humanize_text(
    ai_text: str,
    method: str = "hf",
    adapter_path: Optional[str] = None,
) -> str:
    """
    Takes AI-generated text and rewrites it to sound more human.
    This is the main entry point for the paper-assistant app.
    """
    prompt = HUMANIZE_PROMPT.format(ai_text=ai_text)
    
    if method == "mlx":
        return generate_with_mlx(prompt, adapter_path or "")
    elif method == "llamacpp":
        return generate_with_llamacpp(prompt, adapter_path or "")
    else:
        return generate_with_hf(prompt, adapter_path or "")


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate human-style academic text")
    parser.add_argument("--method", default="hf", choices=["hf", "mlx", "llamacpp"],
                       help="Inference backend")
    parser.add_argument("--adapter_path", default="./outputs/final_adapter",
                       help="Path to fine-tuned LoRA adapter")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--prompt", default="请写一篇关于客户关系管理学术论文的引言部分，需要包含研究背景、研究意义和文献综述，约500字。")
    parser.add_argument("--max_length", type=int, default=2000)
    parser.add_argument("--temperature", type=float, default=0.35)
    parser.add_argument("--humanize_only", action="store_true",
                       help="Only run humanization (takes AI text from stdin)")
    args = parser.parse_args()
    
    if args.humanize_only:
        print("📝 Reading AI text from stdin... (Ctrl+D to finish)")
        ai_text = sys.stdin.read()
        result = humanize_text(ai_text, args.method, args.adapter_path)
        print(result)
    else:
        if args.method == "hf":
            result = generate_with_hf(
                args.prompt, args.adapter_path, args.base_model,
                args.max_length, args.temperature
            )
        elif args.method == "mlx":
            result = generate_with_mlx(
                args.prompt, args.adapter_path, args.base_model,
                args.max_length, args.temperature
            )
        else:
            result = generate_with_llamacpp(
                args.prompt, args.adapter_path, args.max_length, args.temperature
            )
        print(result)
    
    print("\n✅ Generation complete!")


if __name__ == "__main__":
    main()
