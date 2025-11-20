-- 创建公众号订阅映射表
-- 用于实现多用户订阅隔离
-- 执行时间: 2025-11-19

CREATE TABLE IF NOT EXISTS wechat_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- 用户ID
  mp_id VARCHAR(200) NOT NULL,  -- 公众号ID(we-mp-rss返回的)
  mp_name VARCHAR(200) NOT NULL,  -- 公众号名称
  mp_cover TEXT,  -- 封面图URL
  mp_intro TEXT,  -- 公众号简介
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, mp_id)  -- 同一用户不能重复订阅同一个公众号
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_wechat_subscriptions_user_id 
ON wechat_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_wechat_subscriptions_mp_id 
ON wechat_subscriptions(mp_id);

-- 添加外键约束
ALTER TABLE wechat_subscriptions
ADD CONSTRAINT fk_wechat_subscriptions_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_wechat_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_wechat_subscriptions_updated_at
BEFORE UPDATE ON wechat_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_wechat_subscriptions_updated_at();

-- 添加注释
COMMENT ON TABLE wechat_subscriptions IS '公众号订阅映射表(多用户隔离)';
COMMENT ON COLUMN wechat_subscriptions.user_id IS '用户ID';
COMMENT ON COLUMN wechat_subscriptions.mp_id IS '公众号ID(we-mp-rss返回的)';
COMMENT ON COLUMN wechat_subscriptions.mp_name IS '公众号名称';
COMMENT ON COLUMN wechat_subscriptions.mp_cover IS '封面图URL';
COMMENT ON COLUMN wechat_subscriptions.mp_intro IS '公众号简介';

