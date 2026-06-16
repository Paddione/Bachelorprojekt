const { execSync } = require('child_process');
try {
  const result = execSync(
    'FACTORY_DAILY_DEPLOY_CAP=5 FACTORY_GLOBAL_CAP=3 bash /home/patrick/Bachelorprojekt/scripts/vda.sh factory-prep',
    { encoding: 'utf8', timeout: 180000, cwd: '/home/patrick/Bachelorprojekt', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  process.stdout.write(result);
} catch(e) {
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
}
