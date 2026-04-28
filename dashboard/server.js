const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeProcess = null;

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('run-task', ({ command, args, envVars }) => {
        if (activeProcess) {
            socket.emit('log', { type: 'error', data: '\n[Dashboard] A task is already running. Please wait or stop it.\n' });
            return;
        }

        const fullEnv = { ...process.env, ...envVars };
        
        socket.emit('log', { type: 'info', data: `\n[Dashboard] Starting: task ${command} ${args.join(' ')}\n` });

        activeProcess = spawn('task', [command, ...args], {
            env: fullEnv,
            shell: true,
            cwd: path.join(__dirname, '..')
        });

        activeProcess.stdout.on('data', (data) => {
            socket.emit('log', { type: 'stdout', data: data.toString() });
        });

        activeProcess.stderr.on('data', (data) => {
            socket.emit('log', { type: 'stderr', data: data.toString() });
        });

        activeProcess.on('close', (code) => {
            const type = code === 0 ? 'success' : 'error';
            socket.emit('log', { type, data: `\n[Dashboard] Task finished with code ${code}\n` });
            activeProcess = null;
            socket.emit('task-finished', { code });
        });
    });

    socket.on('stop-task', () => {
        if (activeProcess) {
            socket.emit('log', { type: 'info', data: '\n[Dashboard] Stopping task...\n' });
            activeProcess.kill();
            activeProcess = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
