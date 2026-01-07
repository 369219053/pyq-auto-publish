const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function checkUsers() {
  console.log('📋 查询系统用户账号...\n');
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('id', { ascending: true });
  
  if (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  }
  
  console.log(`✅ 共找到 ${data.length} 个用户:\n`);
  
  data.forEach((user, index) => {
    console.log(`${index + 1}. ID: ${user.id}`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   密码: ${user.password}`);
    console.log(`   创建时间: ${user.created_at}`);
    console.log(`   更新时间: ${user.updated_at}`);
    console.log('');
  });
}

checkUsers();
