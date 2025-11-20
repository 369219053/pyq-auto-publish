-- 修复堆雪球账号表的user_id字段类型
-- 从INTEGER改为UUID,以匹配users表的id类型

-- 1. 删除旧的外键约束(如果存在)
ALTER TABLE duixueqiu_accounts DROP CONSTRAINT IF EXISTS fk_duixueqiu_accounts_user_id;

-- 2. 删除旧的索引
DROP INDEX IF EXISTS idx_duixueqiu_accounts_user_id;

-- 3. 修改user_id字段类型为UUID
-- 注意: 如果表中已有数据,需要先清空或手动迁移数据
ALTER TABLE duixueqiu_accounts ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;

-- 4. 重新创建索引
CREATE INDEX idx_duixueqiu_accounts_user_id ON duixueqiu_accounts(user_id);

-- 5. 添加外键约束(可选,但推荐)
ALTER TABLE duixueqiu_accounts 
  ADD CONSTRAINT fk_duixueqiu_accounts_user_id 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6. 更新注释
COMMENT ON COLUMN duixueqiu_accounts.user_id IS '用户ID (UUID类型,关联users表)';

