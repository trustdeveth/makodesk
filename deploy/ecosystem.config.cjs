// PM2 process file — run from the project root after `npm run build` and `deploy/build-standalone.sh`:
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
// Single instance on purpose: the preview market engine lives in process memory,
// so one process keeps every visitor on the same stream.
module.exports = {
  apps: [
    {
      name: "makodesk",
      cwd: __dirname + "/../.next/standalone",
      script: "server.js",
      node_args: "--env-file=../../.env",
      instances: 1,
      exec_mode: "fork",
      // DATA_DIR is pinned outside .next/standalone, which every build wipes (chat history lives there)
      env: { NODE_ENV: "production", PORT: 3000, HOSTNAME: "127.0.0.1", DATA_DIR: __dirname + "/../data" },
      kill_timeout: 5000, // lets the chat store flush on restart
      max_memory_restart: "512M",
      out_file: __dirname + "/../logs/out.log",
      error_file: __dirname + "/../logs/err.log",
      time: true,
    },
  ],
};
