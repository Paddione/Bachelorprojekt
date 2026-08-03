from unsloth import FastLanguageModel

print("Loading fine-tuned model for export...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "lora_model", # Point to our saved LoRA adapters
    max_seq_length = 8192,
    dtype = None,
    load_in_4bit = True,
)

print("Merging LoRA and converting to GGUF (this might take a few minutes)...")
# 'q4_k_m' is the recommended balance of size/quality for Ollama/llama.cpp
model.save_pretrained_gguf(
    "gemma-9b-reasoning-export", 
    tokenizer, 
    quantization_method = "q4_k_m"
)

print("\n=== Export complete! ===")
print("You can now find your .gguf file in the 'gemma-9b-reasoning-export' folder.")
print("You can load this file directly into Ollama, LM Studio, or llama.cpp without needing python!")
