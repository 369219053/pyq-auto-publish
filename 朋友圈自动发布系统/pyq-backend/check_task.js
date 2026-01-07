const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function checkTask() {
  console.log('🔍 查询任务 1767756230958 的信息...\n');
  
  const { data, error } = await supabase
    .from('follow_circle_tasks')
    .select('*')
    .eq('id', '1767756230958');
  
  if (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  }
  
  if (data.length === 0) {
    console.log('❌ 未找到任务 1767756230958');
    process.exit(1);
  }
  
  console.log('✅ 找到任务信息:');
  console.log(JSON.stringify(data[0], null, 2));
}

checkTask();
