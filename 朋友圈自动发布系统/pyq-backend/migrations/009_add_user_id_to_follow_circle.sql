-- 添加user_id字段到follow_circle_tasks表
ALTER TABLE follow_circle_tasks 
ADD COLUMN IF NOT EXISTS user_id INT DEFAULT 1;

-- 添加注释
COMMENT ON COLUMN follow_circle_tasks.user_id IS '用户ID,关联到users表';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_follow_circle_tasks_user_id ON follow_circle_tasks(user_id);

