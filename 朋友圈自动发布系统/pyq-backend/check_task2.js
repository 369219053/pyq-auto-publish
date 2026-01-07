const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function checkTask() {
  console.log('🔍 查询最近失败的任务...\n');
  
  // 查询最近的任务,按创建时间倒序
  const { data, error } = await supabase
    .from('follow_circle_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  }
  
  console.log(`✅ 找到最近的 ${data.length} 个任务:\n`);
  
  data.forEach((task, index) => {
    console.log(`${index + 1}. 任务ID: ${task.id}`);
    console.log(`   状态: ${task.status}`);
    console.log(`   用户ID: ${task.user_id}`);
    console.log(`   创建时间: ${task.created_at}`);
    console.log(`   更新时间: ${task.updated_at}`);
    if (task.error_message) {
      console.log(`   ❌ 错误信息: ${task.error_message}`);
    }
    console.log('');
  });
}

checkTask();
