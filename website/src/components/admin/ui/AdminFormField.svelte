<script lang="ts">
  interface Props {
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
    htmlFor?: string;
  }

  let {
    label,
    error = '',
    hint = '',
    required = false,
    htmlFor = '',
  }: Props = $props();
</script>

<div class="form-field" class:form-field--error={!!error}>
  <label class="form-field__label" for={htmlFor || undefined}>
    {label}
    {#if required}
      <span class="form-field__required" aria-hidden="true">*</span>
    {/if}
  </label>
  <div class="form-field__input">
    <slot />
  </div>
  {#if error}
    <p class="form-field__error" role="alert">{error}</p>
  {:else if hint}
    <p class="form-field__hint">{hint}</p>
  {/if}
</div>

<style>
  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .form-field__label {
    font-family: var(--font-mono);
    font-size: var(--admin-text-xs);
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .form-field__required {
    color: var(--admin-danger);
    margin-left: 2px;
  }

  .form-field__input {
    display: flex;
    flex-direction: column;
  }

  .form-field__error {
    font-size: var(--admin-text-xs);
    color: var(--admin-danger);
    margin: 0;
  }

  .form-field__hint {
    font-size: var(--admin-text-xs);
    color: var(--admin-text-disabled);
    margin: 0;
  }

  .form-field--error .form-field__label {
    color: var(--admin-danger);
  }
</style>
