from unsloth import FastLanguageModel
import torch

# 1. Configuration
max_seq_length = 8192 # Recommended max context for 16GB VRAM (Gemma 9B)
dtype = None # Auto-detects bfloat16 for RTX 50-series
load_in_4bit = True # Keep in 4-bit so we have plenty of VRAM for the KV Cache

# 2. Load Model and our Fine-Tuned LoRA Adapters
print("Loading model and LoRA adapters...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "lora_model", # This loads the base model + our fine-tuned weights!
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# 3. Enable Native Inference Speedups
# This is CRITICAL: it optimizes the model for generation instead of training
FastLanguageModel.for_inference(model) 

# 4. Format Prompt (Gemma Template)
system_prompt = "You are an expert AI programmer. Think step-by-step before answering."
user_prompt = "Write a python script to calculate the fibonacci sequence efficiently."

# Merge system prompt into user prompt (since Gemma doesn't natively support system roles)
merged_prompt = f"{system_prompt}\n\n{user_prompt}" if system_prompt else user_prompt

messages = [
    {"role": "user", "content": merged_prompt}
]

# Apply Gemma chat template
inputs = tokenizer.apply_chat_template(
    messages,
    tokenize = True,
    add_generation_prompt = True, # MUST be True so the model knows it is its turn to speak
    return_tensors = "pt",
).to("cuda")

# 5. Generate
print("Generating reasoning and code...")
outputs = model.generate(
    input_ids = inputs, 
    max_new_tokens = 2048, # The maximum number of tokens it can generate in its response
    use_cache = True, # Speeds up generation using KV cache
    temperature = 0.6, # 0.6 is a great sweet spot for creative reasoning + strict code syntax
    top_p = 0.9,
)

# Decode and print output (ignoring the special tokens)
response = tokenizer.batch_decode(outputs[:, inputs.shape[1]:], skip_special_tokens=True)[0]

print("\n=== AI RESPONSE ===")
print(response)
