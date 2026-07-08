// T001591 — opencode-agent-harness: Spawn-Wrapper mit Lavish-Delegation
// Erkennt "visual" requests und initiiert automatisch Lavish-Agenten

import { spawn } from 'child_process';
import { delegate } from './delegate';

interface VisualRequest {
  prompt: string;
  visualKeywords: string[];
}

const VISUAL_KEYWORDS = [
  'visually',
  'diagram', 
  'visualize',
  'comparison',
  'show me visually',
  'create chart',
  'flowchart',
  'architecture diagram'
];

function detectVisualRequest(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return VISUAL_KEYWORDS.some(keyword => 
    lowerPrompt.includes(keyword) || lowerPrompt.startsWith('show me') && lowerPrompt.includes('visually')
  );
}

async function spawnWithLavishDetection(prompt: string): Promise<void> {
  if (detectVisualRequest(prompt)) {
    // Visual request detected - delegate to lavish agent
    console.log('[HARNESS] Detected visual request, initiating Lavish delegation...');
    
    const task = prompt;
    await delegate(task, 'lavish');
    
    console.log('[HARNESS] Lavish delegation initiated successfully');
  } else {
    // Normal spawn flow - continue with regular processing
    console.log('[HARNESS] Standard spawn request');
  }
}

// Export for use in opencode session
export function handleSpawnRequest(prompt: string): Promise<void> {
  return spawnWithLavishDetection(prompt);
}

// Alternative simple wrapper pattern
export async function spawnWrapper(prompt: string, options?: { 
  autoVisual?: boolean;
}): Promise<boolean> {
  const visualEnabled = options?.autoVisual !== false;
  
  if (visualEnabled && detectVisualRequest(prompt)) {
    await delegate(prompt, 'lavish');
    return true; // Lavish was invoked
  }
  
  return false; // Standard spawn
}

// Test helper for BATS tests
export function testHarness(
  prompt: string, 
  shouldDelegateToLavish: boolean = false 
): { result: boolean; message: string } {
  const visualDetected = detectVisualRequest(prompt);
  
  if (shouldDelegateToLavish) {
    if (!visualDetected) {
      return {
        result: false,
        message: 'Expected visual keyword but none detected'
      };
    }
    return {
      result: true,
      message: 'Visual request correctly identified for Lavish delegation'
    };
  } else {
    if (visualDetected) {
      return {
        result: false,
        message: 'Unexpected visual keyword detected'
      };
    }
    return {
      result: true, 
      message: 'Standard request handled correctly'
    };
  }
}

// Main entry point for opencode integration
export default function harness(prompt: string): void {
  console.log('[HARNESS] Processing:', prompt.substring(0, 80));
  
  handleSpawnRequest(prompt)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[HARNESS] Error:', err);
      process.exit(1);
    });
}

// Pattern matching for CLI usage
export function isVisualQuery(query: string): boolean {
  return detectVisualRequest(query);
}
