-- 给文章表添加user_id字段,实现多用户文章隔离
-- 执行时间: 2025-11-19

-- 1. 添加user_id字段(允许NULL,因为历史数据没有user_id)
ALTER TABLE wechat_articles
ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. 添加外键约束
ALTER TABLE wechat_articles
ADD CONSTRAINT fk_wechat_articles_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_wechat_articles_user_id 
ON wechat_articles(user_id);

-- 4. 创建复合索引(user_id + publish_time)
CREATE INDEX IF NOT EXISTS idx_wechat_articles_user_publish_time 
ON wechat_articles(user_id, publish_time DESC);

-- 5. 添加注释
COMMENT ON COLUMN wechat_articles.user_id IS '用户ID(文章所属用户)';

