-- 创建堆雪球微信号列表表
-- 执行时间: 2025-11-13

CREATE TABLE IF NOT EXISTS duixueqiu_wechat_accounts (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  account_index INT NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  friend_count INT DEFAULT 0,
  last_sync_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, account_index)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_duixueqiu_wechat_accounts_user_id 
ON duixueqiu_wechat_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_duixueqiu_wechat_accounts_last_sync 
ON duixueqiu_wechat_accounts(user_id, last_sync_time);

-- 添加注释
COMMENT ON TABLE duixueqiu_wechat_accounts IS '堆雪球微信号列表';
COMMENT ON COLUMN duixueqiu_wechat_accounts.user_id IS '用户ID';
COMMENT ON COLUMN duixueqiu_wechat_accounts.account_index IS '微信号索引(0-16)';
COMMENT ON COLUMN duixueqiu_wechat_accounts.account_name IS '微信号名称(如"10号机")';
COMMENT ON COLUMN duixueqiu_wechat_accounts.friend_count IS '好友数量';
COMMENT ON COLUMN duixueqiu_wechat_accounts.last_sync_time IS '最后同步时间';

