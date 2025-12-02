-- 优化duixueqiu_friends表的查询性能
-- 执行时间: 2025-12-01

-- 1. 创建组合索引,优化按user_id过滤并按friend_name排序的查询
CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_user_name 
ON duixueqiu_friends(user_id, friend_name);

-- 2. 分析表,更新统计信息
ANALYZE duixueqiu_friends;

-- 3. 查看表的统计信息
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables 
WHERE tablename = 'duixueqiu_friends';

-- 4. 查看索引使用情况
SELECT 
  indexrelname as index_name,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
  AND relname = 'duixueqiu_friends'
ORDER BY idx_scan DESC;

