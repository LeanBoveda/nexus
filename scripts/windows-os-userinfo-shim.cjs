const os = require('node:os');

os.userInfo = () => ({
  username: process.env.USERNAME || 'Usuario',
  uid: -1,
  gid: -1,
  shell: null,
  homedir: process.env.USERPROFILE || process.cwd(),
});
