-- 添加group_id字段到follow_circle_tasks表
ALTER TABLE follow_circle_tasks 
ADD COLUMN IF NOT EXISTS group_id VARCHAR(50);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_follow_circle_tasks_group_id ON follow_circle_tasks(group_id);

-- 添加注释
COMMENT ON COLUMN follow_circle_tasks.group_id IS '任务组ID,用于标识同一组跟圈任务';

