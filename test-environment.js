const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

// Configuration 
const config = {
    realtimeServer: {
        cwd: path.join(__dirname, 'realtime-server'),
        command: 'node',
        args: ['server.js']
    },
    dispatcher: {
        cwd: __dirname,
        command: 'npm',
        args: ['run', 'dev']
    },
    driverApp: {
        cwd: path.join(__dirname, 'driver-app'),
        command: 'npm',
        args: ['run', 'dev']
    }
};

function startProcess(name, options) {
    console.log(`Starting ${name}...`);
    const process = spawn(options.command, options.args, {
        cwd: options.cwd,
        stdio: 'pipe',
        shell: true
    });

    process.stdout.on('data', (data) => {
        console.log(`[${name}] ${data}`);
    });

    process.stderr.on('data', (data) => {
        console.error(`[${name} ERROR] ${data}`);
    });

    return process;
}

async function runTests() {
    // Start all components
    console.log('Starting test environment...');
    
    const realtime = startProcess('realtime-server', config.realtimeServer);
    
    // Wait for realtime server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const dispatcher = startProcess('dispatcher', config.dispatcher);
    const driverApp = startProcess('driver-app', config.driverApp);

    // Run auth flow tests
    console.log('\nRunning authentication tests...');
    require('./test-auth-flow');
    
    // Cleanup function
    function cleanup() {
        console.log('\nCleaning up test environment...');
        realtime.kill();
        dispatcher.kill();
        driverApp.kill();
        process.exit();
    }

    // Handle cleanup on SIGINT
    process.on('SIGINT', cleanup);
    
    // Run cleanup after tests (30s timeout)
    setTimeout(cleanup, 30000);
}

runTests().catch(console.error);