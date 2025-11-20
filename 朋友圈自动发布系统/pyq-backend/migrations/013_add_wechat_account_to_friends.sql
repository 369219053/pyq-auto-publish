-- 为duixueqiu_friends表添加微信号字段
-- 执行时间: 2025-11-13

-- 1. 添加微信号索引字段
ALTER TABLE duixueqiu_friends 
ADD COLUMN IF NOT EXISTS wechat_account_index INT;

-- 2. 添加微信号名称字段
ALTER TABLE duixueqiu_friends 
ADD COLUMN IF NOT EXISTS wechat_account_name VARCHAR(100);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_wechat_account 
ON duixueqiu_friends(user_id, wechat_account_index);

-- 4. 修改唯一约束(同一用户同一微信号不能有重复的好友名称)
DROP INDEX IF EXISTS idx_duixueqiu_friends_unique;
CREATE UNIQUE INDEX idx_duixueqiu_friends_unique 
ON duixueqiu_friends(user_id, wechat_account_index, friend_name);

-- 5. 添加注释
COMMENT ON COLUMN duixueqiu_friends.wechat_account_index IS '微信号索引(0-16,对应17个微信号)';
COMMENT ON COLUMN duixueqiu_friends.wechat_account_name IS '微信号名称(如"10号机")';

