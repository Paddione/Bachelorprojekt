# Hardware Selection Guide

Choosing the right hardware (flavor) is critical for cost-effective training.

## Available Hardware

### CPU
- `cpu-basic` - Basic CPU, testing only
- `cpu-upgrade` - Enhanced CPU

**Use cases:** Dataset validation, preprocessing, testing scripts
**Not recommended for training:** Too slow for any meaningful training

### GPU Options

| Flavor | GPU | Memory | Use Case | Cost/hour |
|--------|-----|--------|----------|-----------|
| `t4-small` | NVIDIA T4 | 16 GB | <1B models, demos | ~$0.50–1 |
| `t4-medium` | NVIDIA T4 | 16 GB | 1–3B models, development | ~$1–2 |
| `l4x1` | NVIDIA L4 | 24 GB | 3–7B models, efficient training | ~$2–3 |
| `l4x4` | 4× NVIDIA L4 | 96 GB | Multi-GPU training | ~$8–12 |
| `a10g-small` | NVIDIA A10G | 24 GB | 3–7B models, production | ~$3–4 |
| `a10g-large` | NVIDIA A10G | 24 GB | 7–13B models | ~$4–6 |
| `a10g-largex2` | 2× NVIDIA A10G | 48 GB | Multi-GPU, large models | ~$8–12 |
| `a10g-largex4` | 4× NVIDIA A10G | 96 GB | Multi-GPU, very large models | ~$16–24 |
| `l40s` | NVIDIA L40S | 48 GB | 13–40B models; best cost/perf above A10G | ~$6–9 |
| `l40sx4` | 4× NVIDIA L40S | 192 GB | High-throughput multi-GPU | ~$24–36 |
| `l40sx8` | 8× NVIDIA L40S | 384 GB | Largest multi-GPU jobs | ~$48–72 |
| `a100-large` | NVIDIA A100 | 80 GB | 40B+ models, fast training | ~$8–12 |
| `h100` | NVIDIA H100 | 80 GB | Maximum single-GPU speed | ~$15–20 |
| `h100x8` | 8× NVIDIA H100 | 640 GB | Maximum scale | ~$120–160 |

> **Note:** Prices are approximate — check [huggingface.co/pricing](https://huggingface.co/pricing) for current rates.

### TPU Options

| Flavor | Type | Use Case |
|--------|------|----------|
| `v5e-1x1` | TPU v5e | Small TPU workloads |
| `v5e-2x2` | 4x TPU v5e | Medium TPU workloads |
| `v5e-2x4` | 8x TPU v5e | Large TPU workloads |

**Note:** TPUs require TPU-optimized code. Most TRL training uses GPUs.

## Selection Guidelines

### By Model Size

**Tiny Models (<1B parameters)**
- **Recommended:** `t4-small`
- **Example:** Qwen2.5-0.5B, TinyLlama
- **Batch size:** 4-8
- **Training time:** 1-2 hours for 1K examples

**Small Models (1-3B parameters)**
- **Recommended:** `t4-medium` or `a10g-small`
- **Example:** Qwen2.5-1.5B, Phi-2
- **Batch size:** 2-4
- **Training time:** 2-4 hours for 10K examples

**Medium Models (3-7B parameters)**
- **Recommended:** `a10g-small` or `a10g-large`
- **Example:** Qwen2.5-7B, Mistral-7B
- **Batch size:** 1-2 (or LoRA with 4-8)
- **Training time:** 4-8 hours for 10K examples

**Large Models (7-13B parameters)**
- **Recommended:** `a10g-large` or `l40s`
- **Example:** Llama-3-8B, Mixtral-8x7B (with LoRA)
- **Batch size:** 1 (full fine-tuning) or 2-4 (LoRA)
- **Training time:** 6-12 hours for 10K examples
- **Note:** Always use LoRA/PEFT

**Very Large Models (13–40B parameters)**
- **Recommended:** `l40s` or `a100-large` with LoRA
- **Example:** Llama-3-13B, Llama-3-70B (LoRA only)
- **Batch size:** 1-2 with LoRA
- **Training time:** 8-24 hours for 10K examples
- **Note:** Full fine-tuning not feasible, use LoRA/PEFT

### By Budget

**Minimal Budget (<$5 total)**
- Use `t4-small`
- Train on subset of data (100-500 examples)
- Limit to 1-2 epochs
- Use small model (<1B)

**Small Budget ($5-20)**
- Use `t4-medium` or `a10g-small`
- Train on 1K-5K examples
- 2-3 epochs
- Model up to 3B parameters

**Medium Budget ($20-50)**
- Use `a10g-small` or `a10g-large`
- Train on 5K-20K examples
- 3-5 epochs
- Model up to 7B parameters

**Large Budget ($50-200)**
- Use `a10g-large`, `l40s`, or `a100-large`
- Full dataset training
- Multiple epochs
- Model up to 13B parameters with LoRA

### By Training Type

**Quick Demo/Experiment**
- `t4-small`
- 50-100 examples
- 5-10 steps
- ~10-15 minutes

**Development/Iteration**
- `t4-medium` or `a10g-small`
- 1K examples
- 1 epoch
- ~30-60 minutes

**Production Training**
- `a10g-large`, `l40s`, or `a100-large`
- Full dataset
- 3-5 epochs
- 4-12 hours

**Research/Experimentation**
- `a100-large`
- Multiple runs
- Various hyperparameters
- Budget for 20-50 hours

## Memory Considerations

### Estimating Memory Requirements

**Full fine-tuning:**
```
Memory (GB) ≈ (Model params in billions) × 20
```

**LoRA fine-tuning:**
```
Memory (GB) ≈ (Model params in billions) × 4
```

**Examples:**
- Qwen2.5-0.5B full: ~10GB ✅ fits t4-small
- Qwen2.5-1.5B full: ~30GB ❌ exceeds most GPUs
- Qwen2.5-1.5B LoRA: ~6GB ✅ fits t4-small
- Qwen2.5-7B full: ~140GB ❌ not feasible
- Qwen2.5-7B LoRA: ~28GB ✅ fits a10g-large

### Memory Optimization

If hitting memory limits:

1. **Use LoRA/PEFT**
   ```python
   peft_config=LoraConfig(r=16, lora_alpha=32)
   ```

2. **Reduce batch size**
   ```python
   per_device_train_batch_size=1
   ```

3. **Increase gradient accumulation**
   ```python
   gradient_accumulation_steps=8  # Effective batch size = 1×8
   ```

4. **Enable gradient checkpointing**
   ```python
   gradient_checkpointing=True
   ```

5. **Use mixed precision**
   ```python
   bf16=True  # or fp16=True
   ```

6. **Upgrade to larger GPU**
   - t4 → a10g → l40s → a100

## Cost Estimation

### Formula

```
Total Cost = (Hours of training) × (Cost per hour)
```

### Example Calculations

**Quick demo:**
- Hardware: t4-small ($0.75/hour)
- Time: 15 minutes (0.25 hours)
- Cost: $0.19

**Development training:**
- Hardware: a10g-small ($3.50/hour)
- Time: 2 hours
- Cost: $7.00

**Production training:**
- Hardware: a10g-large ($5/hour)
- Time: 6 hours
- Cost: $30.00

**Large model with LoRA:**
- Hardware: a100-large ($10/hour)
- Time: 8 hours
- Cost: $80.00

### Cost Optimization Tips

1. **Start small:** Test on t4-small with subset
2. **Use LoRA:** 4-5x cheaper than full fine-tuning
3. **Optimize hyperparameters:** Fewer epochs if possible
4. **Set appropriate timeout:** Don't waste compute on stalled jobs
5. **Use checkpointing:** Resume if job fails
6. **Monitor costs:** Check running jobs regularly

## Multi-GPU Training

TRL automatically handles multi-GPU training with Accelerate when using multi-GPU flavors.

**Multi-GPU flavors:**
- `l4x4` - 4x L4 GPUs
- `a10g-largex2` - 2x A10G GPUs
- `a10g-largex4` - 4x A10G GPUs

**When to use:**
- Models >13B parameters
- Need faster training (linear speedup)
- Large datasets (>50K examples)

**Example:**
```python
hf_jobs("uv", {
    "script": "train.py",
    "flavor": "a10g-largex2",  # 2 GPUs
    "timeout": "4h",
    "secrets": {"HF_TOKEN": "$HF_TOKEN"}
})
```

No code changes needed—TRL/Accelerate handles distribution automatically.

## Choosing Between Options

### a10g vs l40s vs a100

**Choose a10g when:**
- Model <13B parameters
- Budget conscious
- Training time not critical

**Choose l40s when:**
- Model 13–40B parameters (48 GB VRAM sweet spot)
- Best cost/performance above A10G
- Prefer single-GPU over multi-A10G

**Choose a100 when:**
- Model 40B+ parameters or need 80 GB VRAM
- Need maximum throughput
- Budget allows

### Single vs Multi-GPU

**Choose single GPU when:**
- Model <7B parameters
- Budget constrained
- Simpler debugging

**Choose multi-GPU when:**
- Model >13B parameters
- Need faster training
- Large batch sizes required
- Cost-effective for large jobs

## Quick Reference

```python
# Model size → Hardware selection
HARDWARE_MAP = {
    "<1B":     "t4-small",
    "1-3B":    "a10g-small",
    "3-7B":    "a10g-large",
    "7-13B":   "l40s or a10g-large (LoRA)",
    "13-40B":  "l40s or a100-large (LoRA required)",
    ">40B":    "a100-large or h100 (LoRA required)"
}
```

## Inference Endpoints (Post-Training Deployment)

After training on HF Jobs, deploy the resulting model on Inference Endpoints for always-on serving.
Blackwell-generation hardware is now available (mid-2026):

| Instance | GPU | VRAM | Cost/hr (approx) | Use Case |
|----------|-----|------|------------------|----------|
| `nvidia-rtx-pro-6000` | NVIDIA RTX Pro 6000 Blackwell | 96 GB | ~$2.75 | Cost-effective large model serving |
| `nvidia-b200` | NVIDIA B200 Blackwell | 192 GB | ~$9.25 | Maximum throughput, MoE models |

These complement existing A10G, A100, H100, H200 options. For NVFP4-quantized models (e.g., Qwen3-Flash-Next-NVFP4),
Blackwell hardware provides the best price/performance ratio.

> Check the [Inference Endpoints catalog](https://huggingface.co/docs/inference-endpoints) for current availability and pricing.
