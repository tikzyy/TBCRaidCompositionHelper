const { spawn } = require('child_process');
const { join, resolve } = require('path');

const isWindows = process.platform === 'win32';
const backendDir = resolve('Backend');
const python = join(backendDir, '.venv', isWindows ? 'Scripts' : 'bin', 'python');

const proc = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--reload'], {
  cwd: backendDir,
  stdio: 'inherit',
});

proc.on('exit', code => process.exit(code ?? 0));
