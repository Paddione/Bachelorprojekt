# p4: Tests

> **Agent:** devstral | **Files:** 2 | **Steps:** 5
> **Context budget:** ~60000 tokens
> **Verify:** BATS tests pass; `task test:changed` succeeds

## Goal

Write BATS specification tests that verify the new cockpit architecture. Tests must FAIL before implementation (RED → GREEN) as a STRUCT2 gate.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `tests/spec/sdlc-dashboard-redesign.bats` | CREATE | BATS specification tests |
| `website/src/components/cockpit/CommandBar.test.ts` | CREATE | Vitest unit test for CommandBar |

## Steps

### Step 1: Create BATS test file structure

```bash
tests/spec/sdlc-dashboard-redesign.bats
```

Tests must cover:
- Command Bar renders with expected elements
- Overview/Fokus toggle switches modes
- URL carries mode parameter
- Phase navigation in Fokus mode
- Rail content changes with phase
- Old components are absent (PipelinePanel, analytics KPIs)
- Mobile layout activates at < 768px
- Default view preference is read from localStorage

### Step 2: Write RED tests (must fail before implementation)

```bats
#!/usr/bin/env bats

setup() {
  load '../../test_helper/bats-support/load'
  load '../../test_helper/bats-assert/load'
}

@test "SDLC-DASH-01: Command Bar renders with Overview/Fokus toggle" {
  # Check cockpit page HTML contains Command Bar structure
  result=$(curl -s http://localhost:4321/sdlc/cockpit 2>/dev/null || echo "UNREACHABLE")
  assert_output --partial "command-bar"
  # expected: FAIL (red — Command Bar not yet implemented)
}

@test "SDLC-DASH-02: Overview mode shows lifecycle phases" {
  result=$(curl -s "http://localhost:4321/sdlc/cockpit?mode=overview" 2>/dev/null || echo "UNREACHABLE")
  assert_output --partial "overview-dashboard"
  # expected: FAIL
}

@test "SDLC-DASH-03: Fokus mode shows phase content" {
  result=$(curl -s "http://localhost:4321/sdlc/cockpit?mode=fokus&phase=bauen" 2>/dev/null || echo "UNREACHABLE")
  assert_output --partial "factory-floor"
  # expected: FAIL
}

@test "SDLC-DASH-04: PipelinePanel does not exist" {
  [ ! -f "website/src/components/cockpit/PipelinePanel.svelte" ]
  # expected: FAIL (red — PipelinePanel still exists)
}

@test "SDLC-DASH-05: Old analytics KPIs are removed" {
  [ ! -f "website/src/components/sdlc/factory/FactoryKpiGrid.svelte" ]
  # expected: FAIL
}

@test "SDLC-DASH-06: DevStatusTabs tab bar is removed" {
  # The seven-tab AdminTabs component should not be in the cockpit page
  result=$(curl -s http://localhost:4321/sdlc/cockpit 2>/dev/null || echo "UNREACHABLE")
  # Check that the old tab IDs are not present as navigation
  refute_output --partial 'id="factory"'
  # expected: FAIL
}
```

### Step 3: Write Vitest unit test for CommandBar

```typescript
// website/src/components/cockpit/CommandBar.test.ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CommandBar from './CommandBar.svelte';

describe('CommandBar', () => {
  it('renders cluster health indicator', () => {
    const { getByTestId } = render(CommandBar, {
      props: { clusterHealth: 'green', watchdogStale: 0, agentCount: 2, slotsUsed: 3, slotsCap: 5, activeMode: 'overview', brand: 'mentolder' }
    });
    expect(getByTestId('cluster-health')).toBeTruthy();
  });

  it('shows slot usage as X/Y', () => {
    const { getByText } = render(CommandBar, {
      props: { clusterHealth: 'green', watchdogStale: 0, agentCount: 2, slotsUsed: 3, slotsCap: 5, activeMode: 'overview', brand: 'mentolder' }
    });
    expect(getByText('3/5')).toBeTruthy();
  });

  it('emits modechange event on toggle click', async () => {
    const { component, getByTestId } = render(CommandBar, {
      props: { clusterHealth: 'green', watchdogStale: 0, agentCount: 2, slotsUsed: 3, slotsCap: 5, activeMode: 'overview', brand: 'mentolder' }
    });
    const toggle = getByTestId('mode-toggle');
    let emitted = null;
    component.$on('modechange', (e) => { emitted = e.detail; });
    await fireEvent.click(toggle);
    expect(emitted).toEqual({ mode: 'fokus' });
  });
});
```

### Step 4: Run BATS tests — expect FAIL

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-dashboard-redesign.bats
# expected: FAIL (red — implementation not yet done)
```

### Step 5: After p1-p3 implementation — run BATS again — expect PASS

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-dashboard-redesign.bats
# expected: PASS (green — all partials implemented)
```
