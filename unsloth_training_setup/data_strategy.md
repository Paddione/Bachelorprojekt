# Data Strategy

- **Source:** `open-thoughts/OpenThoughts-114k`
- **Format:** SFT (Supervised Fine-Tuning) expecting `messages` columns.
- **Size:** 114k samples (we can limit the steps or take a subset depending on training time constraints).
- **Formatting Logic:** The dataset contains detailed reasoning steps. We will map this to the conversational format (user/assistant) expected by TRL's `SFTTrainer` so the model explicitly learns to "think" before generating code.
