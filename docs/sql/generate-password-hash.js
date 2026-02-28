// 生成管理员密码 hash 的脚本
// 运行: node docs/sql/generate-password-hash.js

const bcrypt = require('bcryptjs');

async function generateHashes() {
  console.log('生成密码 hash...\n');

  // 管理员密码：admin123
  const adminHash = await bcrypt.hash('admin123', 10);
  console.log('管理员密码 (admin123) 的 hash:');
  console.log(adminHash);
  console.log('');

  // 教练密码：user123
  const userHash = await bcrypt.hash('user123', 10);
  console.log('教练密码 (user123) 的 hash:');
  console.log(userHash);
  console.log('');

  console.log('请将这些 hash 值复制到 init-accounts.sql 中');
}

generateHashes().catch(console.error);
