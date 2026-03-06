// MemFire Cloud 连接测试
const { createClient } = require('@supabase/supabase-js');

// 从环境变量读取配置
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 测试 MemFire Cloud 连接...');
console.log('URL:', supabaseUrl);
console.log('Key 前10位:', supabaseKey?.substring(0, 10) + '...');

async function testConnection() {
  try {
    // 创建 Supabase 客户端（兼容 MemFire）
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('\n1. 🧪 测试基本连接...');

    // 测试简单查询
    const { data, error } = await supabase
      .from('admin_users')
      .select('count')
      .limit(1);

    if (error) {
      console.log('❌ 连接失败:', error.message);
      console.log('错误详情:', error);

      // 检查是否是 MemFire 服务
      if (supabaseUrl?.includes('memfiredb.com')) {
        console.log('✅ 检测到 MemFire Cloud 配置');
      } else {
        console.log('⚠️  当前还是 Supabase 配置');
      }

      return false;
    }

    console.log('✅ 基本连接成功!');
    console.log('查询结果:', data);

    // 测试数据库表是否存在
    console.log('\n2. 🗄️ 检查核心表是否存在...');

    const tables = ['admin_users', 'events', 'registrations'];

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);

        if (error) {
          console.log(`❌ 表 "${table}" 不存在或无权限:`, error.message);
        } else {
          console.log(`✅ 表 "${table}" 存在，记录数: ${data?.length || 0}`);
        }
      } catch (err) {
        console.log(`❌ 表 "${table}" 检查失败:`, err.message);
      }
    }

    // 测试认证功能
    console.log('\n3. 🔐 测试认证功能...');

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError) {
        console.log('⚠️  认证服务:', authError.message);
      } else {
        console.log('✅ 认证服务正常');
      }
    } catch (authErr) {
      console.log('❌ 认证服务异常:', authErr.message);
    }

    console.log('\n🎉 MemFire Cloud 连接测试完成!');
    return true;

  } catch (error) {
    console.log('❌ 连接测试失败:', error.message);
    console.log('完整错误:', error);
    return false;
  }
}

// 运行测试
testConnection().then(success => {
  if (success) {
    console.log('\n✅ MemFire Cloud 服务连接正常，可以正常使用！');
  } else {
    console.log('\n❌ MemFire Cloud 服务连接有问题，请检查配置');
  }
  process.exit(0);
});
