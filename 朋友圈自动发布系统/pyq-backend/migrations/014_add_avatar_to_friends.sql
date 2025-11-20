-- 为duixueqiu_friends表添加头像URL字段
-- 执行时间: 2025-11-13

-- 1. 添加头像URL字段
ALTER TABLE duixueqiu_friends 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. 添加注释
COMMENT ON COLUMN duixueqiu_friends.avatar_url IS '好友头像URL';

