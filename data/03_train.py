#!/usr/bin/env python3
"""
QLoRA Fine-tuning Training Script
Trains a small LLM (Qwen2.5-1.5B or ChatGLM3-6B) on human academic papers
to reduce AI detection rate in generated text.

Usage:
    # Local with PyTorch MPS (Apple Silicon):
    pip install torch transformers peft bitsandbytes accelerate datasets
    python 03_train.py --base_model Qwen/Qwen2.5-1.5B-Instruct
    
    # With Axolotl on remote GPU:
    python 03_train.py --use_axolotl --base_model Qwen/Qwen2.5-1.5B-Instruct
    
    # Modal cloud GPU:
    python 03_train.py --modal --base_model Qwen/Qwen2.5-1.5B-Instruct
"""

import argparse
import json
import os
import sys
from pathlib import Path

# ─── Parse Args ────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="QLoRA training on human academic papers")
parser.add_argument("--base_model", default="Qwen/Qwen2.5-1.5B-Instruct",
                   help="HuggingFace model name")
parser.add_argument("--data_path", default=str(Path(__file__).parent / "processed" / "train_chunks.jsonl"))
parser.add_argument("--output_dir", default=str(Path(__file__).parent / "outputs"))
parser.add_argument("--epochs", type=int, default=3)
parser.add_argument("--batch_size", type=int, default=2)
parser.add_argument("--learning_rate", type=float, default=2e-4)
parser.add_argument("--rank", type=int, default=16, help="LoRA rank (lora_r)")
parser.add_argument("--alpha", type=int, default=32, help="LoRA alpha")
parser.add_argument("--target_modules", default="q_proj,k_proj,v_proj,o_proj",
                    help="Modules to apply LoRA")
parser.add_argument("--max_seq_length", type=int, default=512)
parser.add_argument("--use_axolotl", action="store_true")
parser.add_argument("--modal", action="store_true")
parser.add_argument("--quantization", default="4bit", choices=["4bit", "8bit"])
parser.add_argument("--gradient_accumulation_steps", type=int, default=8)
args = parser.parse_args()

# ─── Setup: Choose Execution Backend ───────────────────────────────────────

def check_dependencies():
    """Check which ML framework is available."""
    deps = {}
    try:
        import torch; deps["torch"] = torch.__version__
    except ImportError: deps["torch"] = None
    try:
        import transformers; deps["transformers"] = transformers.__version__
    except ImportError: deps["transformers"] = None
    try:
        import peft; deps["peft"] = peft.__version__
    except ImportError: deps["peft"] = None
    try:
        import mlx; deps["mlx"] = mlx.__version__
    except ImportError: deps["mlx"] = None
    return deps


def run_local_mps():
    """Run training using PyTorch MPS (Apple Silicon)."""
    print("🏃 Running training with PyTorch MPS (Apple Silicon)")
    import torch
    from datasets import load_dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer, DataCollatorForLanguageModeling
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    
    device = torch.device("mps")
    print(f"   MPS device: {device}")
    
    # Load model with quantization
    print(f"   Loading base model: {args.base_model}")
    bnb_config = None
    if args.quantization == "4bit":
        from bitsandbytes import BitsAndBytesConfig
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
    
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
    )
    model = prepare_model_for_kbit_training(model)
    
    # LoRA config
    lora_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        target_modules=[m.strip() for m in args.target_modules.split(",")],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # Load dataset
    print(f"   Loading data from: {args.data_path}")
    dataset = load_dataset("json", data_files=args.data_path, split="train")
    print(f"   Dataset size: {len(dataset)} examples")
    
    def tokenize(examples):
        result = tokenizer(
            examples["text"],
            truncation=True,
            max_length=args.max_seq_length,
            padding="max_length",
        )
        result["labels"] = result["input_ids"].copy()
        return result
    
    dataset = dataset.map(tokenize, batched=True, remove_columns=["text"])
    
    # Training args
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        logging_steps=10,
        save_steps=500,
        save_total_limit=3,
        bf16=True,
        dataloader_num_workers=4,
        remove_unused_columns=False,
        report_to=["none"],
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )
    
    print("🚀 Starting training...")
    trainer.train()
    print("✅ Training complete!")
    
    # Save adapter
    adapter_path = output_dir / "final_adapter"
    model.save_pretrained(adapter_path)
    tokenizer.save_pretrained(adapter_path)
    print(f"   Adapter saved to: {adapter_path}")


def run_mlx():
    """Run training using Apple MLX (most efficient for Apple Silicon)."""
    print("🍎 Running training with MLX (Apple Silicon native)")
    print("   Install: pip install mlx mlx-lm")
    
    # MLX training example (for reference)
    # from mlx_lm.tuner import train
    # from mlx_lm.utils import generate
    #
    # config = {
    #     "model": args.base_model,
    #     "data": args.data_path,
    #     "num_layers": 28,  # for 7B model
    #     "batch_size": args.batch_size,
    #     "iters": 1000,
    #     "val_batches": 25,
    #     "learning_rate": args.learning_rate,
    #     "lora_rank": args.rank,
    # }
    # train(**config)
    
    print("""
MLX Training Example (run manually):
```python
from mlx_lm.tuner import train, TrainingArgs

args = TrainingArgs(
    model="Qwen/Qwen2.5-1.5B-Instruct",
    train_data="data/processed/train_chunks.jsonl",
    lora_rank=16,
    batch_size=2,
    iters=1000,
    learning_rate=2e-4,
)
train(args)
```


export MODEL_PATH=~/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct
export DATA_PATH=./data/processed/train_chunks.jsonl
mlx_lm.lora --model $MODEL_PATH --train --data $DATA_PATH --lora-rank 16 --batch-size 2 --iters 1000
```


To download the model first (on a machine with good network):
```bash
# On a machine with good internet:
huggingface-cli download Qwen/Qwen2.5-1.5B-Instruct --local-dir ~/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct

# Then copy to this Mac:
rsync -avz user@remote:~/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct ~/.cache/huggingface/hub/
```
""")


def generate_axolotl_config():
    """Generate Axolotl config file for remote GPU training."""
    print("📝 Generating Axolotl config...")
    
    config = {
        "base_model": args.base_model,
        "model_type": "causal_lm",
        "quantization": args.quantization,
        "load_in_4bit": args.quantization == "4bit",
        "sequence_len": args.max_seq_length,
        "adapter": "lora",
        "lora_r": args.rank,
        "lora_alpha": args.alpha,
        "lora_dropout": 0.05,
        "lora_target_modules": [m.strip() for m in args.target_modules.split(",")],
        "dataset_preprocessed": True,
        "datasets": [{
            "path": os.path.abspath(args.data_path),
            "type": "json",
            "field_input": "text",
            "field_response": "text",
        }],
        "num_epochs": args.epochs,
        "micro_batch_size": args.batch_size,
        "gradient_accumulation_steps": args.gradient_accumulation_steps,
        "optimizer": "adamw",
        "learning_rate": args.learning_rate,
        "train_on_inputs": True,
        "warmup_steps": 100,
        "output_dir": os.path.abspath(args.output_dir),
        "bf16": True,
        "save_safetensors": True,
        "logging": "steps",
        "log_interval_steps": 10,
    }
    
    output_path = Path(args.output_dir) / "qlora_axolotl.yaml"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    import yaml
    with open(output_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    print(f"   Config written to: {output_path}")
    print(f"""
To train with Axolotl on a GPU server:

    # On the GPU server:
    conda create -n axolotl python=3.10
    conda activate axolotl
    pip install axolotl[torch] transformers peft bitsandbytes accelerate datasets
    rsync -avz user@this-mac:~/projects/paper-assistant/data/processed/ ./data/processed/
    
    # Create ~/.config/axolotl/qlora_axolotl.yaml with your data paths
    axolotl train data/processed/qlora_axolotl.yaml
    
    # Download model (or let axolotl auto-download)
    huggingface-cli download {args.base_model}
""")


# ─── Main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    deps = check_dependencies()
    print(f"📦 Available dependencies: {deps}")
    
    if args.modal:
        print("🚢 Modal cloud training — generating training function...")
        print("   (Run this script normally to generate the Modal function)")
        print("""
To run with Modal (remote GPU):
```python
# modal_run.py
import modal

app = modal.App("paper-assistant-train")

@app.function(gpu="A100", timeout=3600*8)
def train_model():
    # Run the full training pipeline here
    import subprocess
    subprocess.run(["python", "03_train.py", "--base_model", "Qwen/Qwen2.5-1.5B-Instruct"])
""")
    
    elif args.use_axolotl:
        generate_axolotl_config()
        
    elif deps["torch"] and deps["transformers"] and deps["peft"]:
        if torch.backends.mps.is_available():
            run_local_mps()
        else:
            print("⚠️  MPS not available. Install PyTorch with MPS support:")
            print("   pip install torch --index-url https://download.pytorch.org/whl/cpu")
            print("   (For GPU training, use remote GPU or Axolotl config)")
    else:
        print("⚠️  Missing dependencies. Checking MLX...")
        if deps["mlx"]:
            run_mlx()
        else:
            print("""
❌ No ML framework available. Install dependencies:

🍎 Apple Silicon Mac (recommended — native MLX):
    pip install mlx mlx-lm
    
🖥️  Remote GPU (recommended — faster training):
    # Install on any machine with GPU:
    pip install torch transformers peft bitsandbytes accelerate datasets axolotl
    python 03_train.py --use_axolotl

☁️  Cloud GPU (Modal):
    pip install modal
    modal setup
    python 03_train.py --modal

📥 Download base model:
    huggingface-cli download {args.base_model}
    # or use the --base_model argument to auto-download

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommended: Use Axolotl on a remote GPU server
(export HUGGINGFACE_TOKEN=your_token first)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
