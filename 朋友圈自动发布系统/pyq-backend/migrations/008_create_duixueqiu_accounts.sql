-- 创建堆雪球账号管理表
CREATE TABLE IF NOT EXISTS duixueqiu_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_duixueqiu_accounts_user_id ON duixueqiu_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_duixueqiu_accounts_status ON duixueqiu_accounts(status);

-- 添加注释
COMMENT ON TABLE duixueqiu_accounts IS '堆雪球账号管理表';
COMMENT ON COLUMN duixueqiu_accounts.user_id IS '用户ID';
COMMENT ON COLUMN duixueqiu_accounts.account_name IS '账号名称(用户自定义)';
COMMENT ON COLUMN duixueqiu_accounts.username IS '堆雪球用户名';
COMMENT ON COLUMN duixueqiu_accounts.password IS '堆雪球密码(加密存储)';
COMMENT ON COLUMN duixueqiu_accounts.is_default IS '是否默认账号';
COMMENT ON COLUMN duixueqiu_accounts.status IS '账号状态: active/inactive';

