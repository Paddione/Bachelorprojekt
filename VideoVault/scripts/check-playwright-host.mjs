#!/usr/bin/env node
// Check if Playwright can run on the host system, with helpful hints if not

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const platform = os.platform();

function checkCommand(cmd, args = []) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', () => {
      resolve(false);
    });
  });
}

async function checkLinuxDeps() {
  // Check for common missing libraries on Linux
  const requiredCommands = ['which', 'ldd'];
  for (const cmd of requiredCommands) {
    if (!(await checkCommand(cmd))) {
      console.warn(`⚠️  Command '${cmd}' not found. Some dependency checks may be incomplete.`);
    }
  }

  // Try to check for common Playwright dependencies
  const chromiumPath = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'lib', 'server', 'chromium-*');
  
  // Check if chromium binary exists (rough check)
  try {
    const playwrightDir = path.join(process.cwd(), 'node_modules', '@playwright');
    if (!fs.existsSync(playwrightDir)) {
      return { canRun: false, reason: 'Playwright not installed' };
    }
  } catch (e) {
    return { canRun: false, reason: 'Cannot check Playwright installation' };
  }

  // Try running a simple Playwright command to see if deps are missing
  const playwrightBin = path.join(process.cwd(), 'node_modules', '.bin', 'playwright');
  if (fs.existsSync(playwrightBin)) {
    const canRunPlaywright = await checkCommand(playwrightBin, ['--version']);
    if (!canRunPlaywright) {
      return { 
        canRun: false, 
        reason: 'Playwright binary fails to run (likely missing system dependencies)',
        installHint: 'Try: npx playwright install-deps'
      };
    }
  }

  return { canRun: true };
}

async function checkMacOS() {
  // macOS usually has fewer dependency issues, but check basics
  return { canRun: true };
}

async function checkWindows() {
  // Windows checks - mainly ensuring PowerShell/basic deps
  const hasPowerShell = await checkCommand('powershell', ['-Command', 'Get-Host']);
  if (!hasPowerShell) {
    return { 
      canRun: false, 
      reason: 'PowerShell not available',
      installHint: 'Install PowerShell or run via WSL2'
    };
  }
  return { canRun: true };
}

async function main() {
  console.log('🔍 Checking host system for Playwright compatibility...');
  
  let result;
  switch (platform) {
    case 'linux':
      result = await checkLinuxDeps();
      break;
    case 'darwin':
      result = await checkMacOS();
      break;
    case 'win32':
      result = await checkWindows();
      break;
    default:
      result = { canRun: false, reason: `Unsupported platform: ${platform}` };
  }

  if (result.canRun) {
    console.log('✅ Host system appears ready for Playwright');
    process.exit(0);
  } else {
    console.error(`❌ Host system check failed: ${result.reason}`);
    
    if (result.installHint) {
      console.error(`💡 Installation hint: ${result.installHint}`);
    }
    
    console.error('');
    console.error('🐳 Alternative: Use Docker for reliable E2E testing:');
    console.error('   npm run docker:pw:all    # Run all tests in Docker');
    console.error('   npm run docker:pw:ui     # Interactive UI in Docker (http://localhost:9323)');
    console.error('');
    
    // Don't exit with error code - just warn
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Error checking system:', error.message);
  console.error('🐳 Recommend using Docker: npm run docker:pw:all');
  process.exit(0);
});