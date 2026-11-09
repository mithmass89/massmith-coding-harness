// pm2 ecosystem for dsh-superagent (combined massmith + superagent, headless).
// dsh binary from npm cache (v0.2.1-alpha.2). Run `node` with the bin.js entry,
// NOT the dsh.cmd wrapper (pm2 can't exec .cmd directly).
module.exports = {
  apps: [
    {
      name: 'superagent',
      script: 'C:\Users\ThinkPad\AppData\Local\npm-cache\_npx\b5c6312874079fe8\node_modules\@deepseek-ai\dsh\lib\bin.js',
      interpreter: 'node',
      args: '--profile superagent --no-open',
      cwd: 'C:\Users\ThinkPad\.dsh',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        DSH_HOME: 'C:/Users/ThinkPad/.dsh'
      }
    }
  ]
}
