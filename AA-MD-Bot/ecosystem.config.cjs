// PM2 Ecosystem Config — AA MD Bot (Oracle Cloud / Ubuntu VPS)
// Usage:
//   pm2 start ecosystem.config.cjs          # start
//   pm2 restart aa-md-bot                   # restart
//   pm2 logs aa-md-bot                      # view logs
//   pm2 monit                               # live monitor
//   pm2 save                                # save for auto-restart on reboot
//   pm2 startup                             # generate startup script

const path = require('path');

// Load .env from the bot directory — spreads into env block below
// so all .env variables are available inside the Node.js process
let dotenvVars = {};
try {
  const result = require('dotenv').config({ path: path.join(__dirname, '.env') });
  if (result.parsed) dotenvVars = result.parsed;
} catch { }

module.exports = {
  apps: [
    {
      name: 'aa-md-bot',
      script: 'index.js',
      cwd: __dirname,
      interpreter: 'node',
      node_args: '--experimental-vm-modules',

      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: '30s',

      // Give the process 15 seconds to flush MongoDB writes before SIGKILL.
      // Default PM2 kill_timeout is 1600ms — too short for async flushOnExit.
      kill_timeout: 15000,

      // Memory guard — restart if over 1.5 GB
      max_memory_restart: '1500M',

      // Logs — written to the logs/ directory inside the bot folder
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-err.log'),
      merge_logs: true,

      // Environment — all .env vars are spread here so the app sees them
      env: {
        NODE_ENV: 'production',
        PORT: dotenvVars.PORT || process.env.PORT || '5000',
        SERVER_ID: dotenvVars.SERVER_ID || process.env.SERVER_ID || 'server-1',
        ...dotenvVars,
      },
    },
  ],
};
