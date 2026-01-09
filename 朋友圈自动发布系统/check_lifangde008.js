const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './pyq-backend/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  try {
    // 1. 查找lifangde008用户
    const { data: users, error: userError } = await supabase
      .from('system_users')
      .select('*')
      .eq('username', 'lifangde008');
    
    if (userError) {
      console.log('❌ 查询用户失败:', userError.message);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('❌ 未找到lifangde008用户');
      console.log('📋 尝试查询所有用户名包含lifang的用户...');
      
      const { data: allUsers } = await supabase
        .from('system_users')
        .select('username, id')
        .ilike('username', '%lifang%');
      
      console.log('找到的用户:', allUsers);
      return;
    }
    
    const user = users[0];
    console.log('✅ 找到用户:', user.username, 'ID:', user.id);
    
    // 2. 查询最近的脚本2执行记录
    const { data: history, error: historyError } = await supabase
      .from('message_send_history')
      .select('*')
      .eq('user_id', user.id)
      .order('sent_at', { ascending: false })
      .limit(20);
    
    if (historyError) {
      console.log('❌ 查询发送记录失败:', historyError.message);
      return;
    }
    
    console.log('\n📋 最近20条发送记录:');
    if (history && history.length > 0) {
      history.forEach((record, index) => {
        const time = new Date(record.sent_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(`${index + 1}. [${time}] 好友:${record.friend_name} 类型:${record.message_type}`);
      });
      
      console.log(`\n✅ 共找到 ${history.length} 条记录`);
      console.log(`📅 最早记录: ${new Date(history[history.length - 1].sent_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`📅 最新记录: ${new Date(history[0].sent_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    } else {
      console.log('❌ 没有找到发送记录');
    }
    
  } catch (error) {
    console.error('❌ 执行出错:', error.message);
  }
})();

