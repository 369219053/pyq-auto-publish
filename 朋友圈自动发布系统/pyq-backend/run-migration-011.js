const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少环境变量: SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('🚀 开始执行数据库迁移 011...');
    
    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'migrations', '011_create_duixueqiu_video_materials.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 SQL内容:');
    console.log(sql);
    console.log('\n');
    
    // 执行SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ 迁移失败:', error);
      process.exit(1);
    }
    
    console.log('✅ 迁移成功!');
    console.log('📊 结果:', data);
    
  } catch (error) {
    console.error('❌ 执行迁移时出错:', error);
    process.exit(1);
  }
}

runMigration();

