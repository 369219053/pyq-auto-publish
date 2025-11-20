const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少Supabase配置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('📝 读取迁移文件...');
    const migrationPath = path.join(__dirname, 'migrations', '009_add_user_id_to_follow_circle.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('🚀 执行迁移...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ 迁移失败:', error);
      process.exit(1);
    }

    console.log('✅ 迁移成功!');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

runMigration();

