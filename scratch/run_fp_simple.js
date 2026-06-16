const { execFileSync } = require('child_process');
try {
  const result = execFileSync('/usr/bin/bash', ['/home/patrick/Bachelorprojekt/scripts/vda.sh', 'factory-prep'], {
    encoding: 'utf8', timeout: 180000, cwd: '/home/patrick/Bachelorprojekt',
    env: { ...process.env, FACTORY_DAILY_DEPLOY_CAP: '5', FACTORY_GLOBAL_CAP: '3' },
    stdio: 'pipe'
  });
  process.stdout.write(result.trim());
} catch(e) {
  if (e.stdout) process.stdout.write(e.stdout.trim());
  if (!e.stdout) process.stdout.write('{}');
}
