const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://upcsdbcpmzpywvykiqtu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwY3NkYmNwbXpweXd2eWtpcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExMjI0NzgsImV4cCI6MjA3NjY5ODQ3OH0.-NVmwlrjdVvgoyhXMpi_HsBhYrDvfEKIYQAimuhMKDI'
);

async function checkAccounts() {
  console.log('📋 查询所有堆雪球账号...\n');
  
  const { data, error } = await supabase
    .from('duixueqiu_accounts')
    .select('*')
    .order('id', { ascending: true });
  
  if (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  }
  
  console.log(`✅ 共找到 ${data.length} 个账号:\n`);
  
  data.forEach((account, index) => {
    console.log(`${index + 1}. 账号名: ${account.account_name}`);
    console.log(`   用户名: ${account.username}`);
    console.log(`   密码: ${account.password}`);
    console.log(`   默认账号: ${account.is_default ? '是' : '否'}`);
    console.log(`   状态: ${account.status}`);
    console.log(`   创建时间: ${account.created_at}`);
    console.log('');
  });
}

checkAccounts();
