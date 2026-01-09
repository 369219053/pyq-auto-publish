const https = require('https');

const SUPABASE_URL = 'https://pxmopubswbienvjzaskc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bW9wdWJzd2JpZW52anphc2tjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDcxMjc3MCwiZXhwIjoyMDQ2Mjg4NzcwfQ.kKqh0_yqJPOqKqQqQqQqQqQqQqQqQqQqQqQqQqQ';

// 执行SQL的函数
async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: 'pxmopubswbienvjzaskc.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 执行优化脚本
async function optimize() {
  console.log('🔧 开始优化duixueqiu_friends表...\n');
  
  // 1. 创建组合索引
  console.log('1️⃣ 创建组合索引...');
  try {
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_user_name 
      ON duixueqiu_friends(user_id, friend_name);
    `);
    console.log('✅ 组合索引创建成功\n');
  } catch (e) {
    console.log('⚠️ 组合索引可能已存在:', e.message, '\n');
  }
  
  // 2. 创建覆盖索引
  console.log('2️⃣ 创建覆盖索引(这可能需要1-2分钟)...');
  try {
    await executeSQL(`
      CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_covering 
      ON duixueqiu_friends(user_id, friend_name) 
      INCLUDE (id, friend_remark, avatar_url, wechat_account_index, wechat_account_name, is_selected);
    `);
    console.log('✅ 覆盖索引创建成功\n');
  } catch (e) {
    console.log('⚠️ 覆盖索引可能已存在:', e.message, '\n');
  }
  
  // 3. 优化表统计
  console.log('3️⃣ 优化表统计信息...');
  try {
    await executeSQL('VACUUM ANALYZE duixueqiu_friends;');
    console.log('✅ 表统计优化成功\n');
  } catch (e) {
    console.log('⚠️ 表统计优化失败:', e.message, '\n');
  }
  
  console.log('🎉 优化完成!');
}

optimize().catch(console.error);
