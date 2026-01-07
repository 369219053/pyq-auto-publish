const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function updatePassword() {
  console.log('🔄 正在更新堆雪球账号lifangde004的密码...');
  
  const { data, error } = await supabase
    .from('duixueqiu_accounts')
    .update({ password: 'Lfd666888#' })
    .eq('username', 'lifangde004')
    .select();
  
  if (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  }
  
  console.log('✅ 密码更新成功!');
  console.log('更新的记录:', JSON.stringify(data, null, 2));
}

updatePassword();
