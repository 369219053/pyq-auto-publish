-- 添加standard_mp_id字段到wechat_subscriptions表
-- 用于存储we-mp-rss的标准格式mp_id (MP_WXS_xxx)

ALTER TABLE wechat_subscriptions
ADD COLUMN IF NOT EXISTS standard_mp_id VARCHAR(255);

-- 添加注释
COMMENT ON COLUMN wechat_subscriptions.mp_id IS 'Base64编码的mp_id (we-mp-rss添加订阅时返回)';
COMMENT ON COLUMN wechat_subscriptions.standard_mp_id IS '标准格式的mp_id (MP_WXS_xxx, we-mp-rss查询订阅列表时返回)';

-- 为standard_mp_id创建索引
CREATE INDEX IF NOT EXISTS idx_wechat_subscriptions_standard_mp_id 
ON wechat_subscriptions(standard_mp_id);

