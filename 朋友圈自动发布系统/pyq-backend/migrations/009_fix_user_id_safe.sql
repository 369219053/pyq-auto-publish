-- 安全修复堆雪球账号表的user_id字段类型
-- 方案: 先备份数据,删除表,重新创建

-- 1. 备份现有数据到临时表
CREATE TABLE IF NOT EXISTS duixueqiu_accounts_backup AS 
SELECT * FROM duixueqiu_accounts;

-- 2. 删除原表
DROP TABLE IF EXISTS duixueqiu_accounts CASCADE;

-- 3. 重新创建表(user_id改为UUID类型)
CREATE TABLE duixueqiu_accounts (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 创建索引
CREATE INDEX idx_duixueqiu_accounts_user_id ON duixueqiu_accounts(user_id);
CREATE INDEX idx_duixueqiu_accounts_status ON duixueqiu_accounts(status);

-- 5. 添加外键约束
ALTER TABLE duixueqiu_accounts 
  ADD CONSTRAINT fk_duixueqiu_accounts_user_id 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6. 添加注释
COMMENT ON TABLE duixueqiu_accounts IS '堆雪球账号管理表';
COMMENT ON COLUMN duixueqiu_accounts.user_id IS '用户ID (UUID类型,关联users表)';
COMMENT ON COLUMN duixueqiu_accounts.account_name IS '账号名称(用户自定义)';
COMMENT ON COLUMN duixueqiu_accounts.username IS '堆雪球用户名';
COMMENT ON COLUMN duixueqiu_accounts.password IS '堆雪球密码(加密存储)';
COMMENT ON COLUMN duixueqiu_accounts.is_default IS '是否默认账号';
COMMENT ON COLUMN duixueqiu_accounts.status IS '账号状态: active/inactive';

-- 7. 如果需要恢复数据,可以手动执行:
-- INSERT INTO duixueqiu_accounts (user_id, account_name, username, password, is_default, status, created_at, updated_at)
-- SELECT user_id::text::uuid, account_name, username, password, is_default, status, created_at, updated_at
-- FROM duixueqiu_accounts_backup;

-- 8. 确认无误后删除备份表:
-- DROP TABLE duixueqiu_accounts_backup;

