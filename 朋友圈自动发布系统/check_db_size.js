const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://pxmopubswbienvjzaskc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bW9wdWJzd2JpZW52anphc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA3MTI3NzAsImV4cCI6MjA0NjI4ODc3MH0.VJWuUIG_r7x7vYEqUnits3Uw_zcKkKPOJqTEMCqPLbI'
);

async function checkSize() {
  console.log('🔍 检查数据库存储情况...\n');
  
  // 检查好友表数据量
  const { count: friendsCount, error: e1 } = await supabase
    .from('duixueqiu_friends')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📊 duixueqiu_friends 表记录数: ${friendsCount || '查询失败'}`);
  if (e1) console.log(`   错误: ${e1.message}\n`);
  
  // 检查其他大表
  const tables = [
    'follow_circle_tasks',
    'wechat_articles', 
    'duixueqiu_video_materials',
    'duixueqiu_link_materials'
  ];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 ${table} 表记录数: ${count || '查询失败'}`);
    if (error) console.log(`   错误: ${error.message}`);
  }
}

checkSize().then(() => process.exit(0)).catch(e => {
  console.error('❌ 检查失败:', e.message);
  process.exit(1);
});
