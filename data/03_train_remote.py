#!/usr/bin/env python3
"""
QLoRA Training Script — Run on Remote GPU
Trains Qwen2.5-1.5B on human academic papers.
"""

import os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer, DataCollatorForLanguageModeling
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from bitsandbytes import BitsAndBytesConfig

# Config
BASE_MODEL = "/workspace/models/Qwen--Qwen2.5-1.5B-Instruct"
DATA_PATH = "/workspace/processed/train_chunks.jsonl"
OUTPUT_DIR = "/workspace/outputs"
EPOCHS = 3
BATCH_SIZE = 4
LEARNING_RATE = 2e-4
RANK = 16
ALPHA = 32
MAX_SEQ = 512
GRAD_ACCUM = 4

print("=" * 60)
print("QLoRA Fine-tuning: Qwen2.5-1.5B on Human Academic Papers")
print("=" * 60)

# Load tokenizer
print("\n[1/5] Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
print(f"   Tokenizer loaded: {tokenizer.__class__.__name__}")

# Load dataset
print(f"\n[2/5] Loading dataset from {DATA_PATH}...")
dataset = load_dataset("json", data_files=DATA_PATH, split="train")
print(f"   Dataset: {len(dataset)} examples")

def tokenize(examples):
    result = tokenizer(
        examples["text"],
        truncation=True,
        max_length=MAX_SEQ,
        padding="max_length",
    )
    result["labels"] = result["input_ids"].copy()
    return result

dataset = dataset.map(tokenize, batched=True, remove_columns=["text"])
print(f"   Tokenized: {len(dataset)} examples")

# Load model with 4-bit quantization
print(f"\n[3/5] Loading model with QLoRA (4-bit)...")
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
    torch_dtype=torch.bfloat16,
)
model = prepare_model_for_kbit_training(model)

# LoRA config
lora_config = LoRAConfig(
    r=RANK,
    lora_alpha=ALPHA,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Training args
print(f"\n[4/5] Setting up training...")
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    gradient_accumulation_steps=GRAD_ACCUM,
    learning_rate=LEARNING_RATE,
    warmup_ratio=0.1,
    lr_scheduler_type="cosine",
    logging_steps=10,
    save_steps=200,
    save_total_limit=2,
    bf16=True,
    dataloader_num_workers=4,
    remove_unused_columns=False,
    report_to=["none"],
    optim="paged_adamw_8bit",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
)

# Train!
print(f"\n[5/5] Starting training...")
print(f"   Epochs: {EPOCHS}")
print(f"   Batch size: {BATCH_SIZE} x {GRAD_ACCUM} (grad accum) = {BATCH_SIZE * GRAD_ACCUM}")
print(f"   Steps: ~{len(dataset) // (BATCH_SIZE * GRAD_ACCUM)} steps per epoch")
print("=" * 60)

trainer.train()

print("\n✅ Training complete!")

# Save
adapter_path = f"{OUTPUT_DIR}/final_adapter"
model.save_pretrained(adapter_path)
tokenizer.save_pretrained(adapter_path)
print(f"   Adapter saved to: {adapter_path}")

# Verify
print(f"\n📊 Final stats:")
import json
logs = trainer.state.log_history
if logs:
    last_loss = [l for l in logs if "loss" in l]
    if last_loss:
        print(f"   Final train loss: {last_loss[-1]['loss']:.4f}")
    print(f"   Total steps: {trainer.state.global_step}")
