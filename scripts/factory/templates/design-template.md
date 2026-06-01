# Design: {feature_title}

**Ticket:** {external_id}
**Spec File:** `docs/superpowers/specs/{date}-{slug}-design.md`
**Timestamp:** {timestamp}

## Architectural Decision

{one paragraph: chosen approach and why}

## Trade-offs Considered

```json
{
  "options": [
    {
      "name": "{option_name}",
      "pros": ["{pro1}", "{pro2}"],
      "cons": ["{con1}", "{con2}"],
      "chosen": true|false
    }
  ]
}
```

## Adversarial Review

**Reviewer Agent:** {agent_label}
**Verdict:** `[approved | needs_revision | rejected]`

### Challenge 1: {challenge_title}
- **Claim**: {what the design claims}
- **Counter-argument**: {why it might be wrong}
- **Resolution**: {how the concern was addressed or why it's accepted}

### Challenge 2: {challenge_title}
- **Claim**: ...
- **Counter-argument**: ...
- **Resolution**: ...

## Affected Components

| Component | Impact | Risk |
|-----------|--------|------|
| {component} | {low/medium/high} | {risk description} |

## Migration / Rollback Plan

- **Forward**: {steps to deploy}
- **Backward**: {steps to rollback if needed}
