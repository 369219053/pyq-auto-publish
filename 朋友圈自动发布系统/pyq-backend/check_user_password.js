const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function checkPassword() {
  console.log('🔍 查询系统用户lifangde002的信息...\n');
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', 'lifangde002');
  
  if (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  }
  
  if (data.length === 0) {
    console.log('❌ 未找到用户lifangde002');
    process.exit(1);
  }
  
  console.log('✅ 找到用户信息:');
  console.log('用户名:', data[0].username);
  console.log('用户ID:', data[0].id);
  console.log('加密后的密码:', data[0].password);
  console.log('创建时间:', data[0].created_at);
  console.log('更新时间:', data[0].updated_at);
  console.log('\n💡 提示: 密码已加密存储,原始密码是 Lfd666888# (刚才已更新)');
}

checkPassword();
