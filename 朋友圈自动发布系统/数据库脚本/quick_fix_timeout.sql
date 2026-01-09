-- 快速修复好友列表查询超时问题
-- 执行方式: 在Supabase SQL Editor中执行

-- 1. 创建必要的索引(如果不存在)
CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_user_name 
ON duixueqiu_friends(user_id, friend_name);

-- 2. 创建覆盖索引(包含所有查询字段,避免回表,大幅提升查询速度)
CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_covering 
ON duixueqiu_friends(user_id, friend_name) 
INCLUDE (id, friend_remark, avatar_url, wechat_account_index, wechat_account_name, is_selected);

-- 3. 优化表统计信息
VACUUM ANALYZE duixueqiu_friends;

-- 4. 查看优化效果(可选)
SELECT 
  pg_size_pretty(pg_total_relation_size('duixueqiu_friends')) as total_size,
  COUNT(*) as total_friends
FROM duixueqiu_friends;

