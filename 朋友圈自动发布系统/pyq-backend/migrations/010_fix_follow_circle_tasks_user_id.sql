-- 修改 follow_circle_tasks 表的 user_id 字段类型从 INTEGER 改为 UUID
-- 执行时间: 2025-10-29

-- 1. 删除外键约束(如果存在)
ALTER TABLE follow_circle_tasks 
DROP CONSTRAINT IF EXISTS follow_circle_tasks_user_id_fkey;

-- 2. 修改 user_id 字段类型为 UUID
ALTER TABLE follow_circle_tasks 
ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;

-- 3. 重新添加外键约束
ALTER TABLE follow_circle_tasks 
ADD CONSTRAINT follow_circle_tasks_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 验证修改
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'follow_circle_tasks' AND column_name = 'user_id';

