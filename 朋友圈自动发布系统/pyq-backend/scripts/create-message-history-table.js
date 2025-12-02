/**
 * 创建message_send_history表的脚本
 * 用于防止重复发送消息
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从.env文件读取配置
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少Supabase配置!');
  console.error('请确保.env文件中包含:');
  console.error('- SUPABASE_URL');
  console.error('- SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  console.log('🚀 开始创建message_send_history表...\n');

  // 读取SQL文件
  const sqlFile = path.join(__dirname, '../supabase/migrations/20251201_create_message_send_history.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('📄 SQL内容:');
  console.log('─'.repeat(80));
  console.log(sql);
  console.log('─'.repeat(80));
  console.log('');

  try {
    // 执行SQL
    console.log('⏳ 正在执行SQL...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ 执行失败:', error);
      
      // 尝试直接使用PostgreSQL连接
      console.log('\n🔄 尝试使用直接SQL执行...');
      const { Pool } = require('pg');

      // 使用DATABASE_URL
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL未配置');
      }

      const pool = new Pool({
        connectionString: databaseUrl,
      });

      await pool.query(sql);
      console.log('✅ 表创建成功!');
      await pool.end();
    } else {
      console.log('✅ 表创建成功!');
      console.log('📊 结果:', data);
    }

    // 验证表是否创建成功
    console.log('\n🔍 验证表结构...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('message_send_history')
      .select('*')
      .limit(0);

    if (tableError) {
      console.error('⚠️ 验证失败:', tableError);
    } else {
      console.log('✅ 表验证成功!');
    }

  } catch (err) {
    console.error('❌ 发生错误:', err);
    process.exit(1);
  }
}

createTable()
  .then(() => {
    console.log('\n🎉 脚本执行完成!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ 脚本执行失败:', err);
    process.exit(1);
  });

