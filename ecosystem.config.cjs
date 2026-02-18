module.exports = {
  apps: [
    {
      name: 'y-eye-preview',
      script: 'npx',
      args: 'serve dist -l 3000 --no-clipboard -s',
      env: {
        NODE_ENV: 'production',
        WEB_PREVIEW: '1',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
