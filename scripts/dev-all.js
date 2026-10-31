const { spawn } = require('child_process');

console.log('====================================================');
console.log('🚀 Starting GebeyaOS Multi-Tenant Full Stack Dev');
console.log('   - Branch LAN Server : http://localhost:3001');
console.log('   - POS Web Client   : http://localhost:3000');
console.log('====================================================\n');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// 1. Start Branch Server (port 3001)
const branchServer = spawn(npmCmd, ['run', 'start:dev', '-w', 'apps/branch-server'], {
  stdio: 'inherit',
  shell: true,
});

// 2. Start POS Web Frontend (port 3000)
const posWeb = spawn(npmCmd, ['run', 'dev', '-w', 'apps/pos-web'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\nStopping GebeyaOS dev processes...');
  try {
    branchServer.kill();
    posWeb.kill();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

