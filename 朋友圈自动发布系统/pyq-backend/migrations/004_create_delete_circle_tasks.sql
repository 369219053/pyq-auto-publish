-- 创建跟圈删除任务表
CREATE TABLE IF NOT EXISTS delete_circle_tasks (
  id SERIAL PRIMARY KEY,
  task_group_id VARCHAR(255) NOT NULL,     -- 任务组ID (例如: "跟圈_1729872000000")
  circle_index INTEGER NOT NULL,           -- 第几条朋友圈 (1=第1条, 2=第2条...)
  delete_title VARCHAR(255) NOT NULL,      -- 要删除的任务标题 (例如: "跟圈_1729872000000_第1条")
  delete_content TEXT NOT NULL,            -- 朋友圈内容 (用于双重验证)
  delete_time TIMESTAMP NOT NULL,          -- 删除时间
  status VARCHAR(20) DEFAULT 'pending',    -- pending/completed/failed
  error_message TEXT,                      -- 错误信息
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_delete_circle_tasks_status ON delete_circle_tasks(status);
CREATE INDEX idx_delete_circle_tasks_delete_time ON delete_circle_tasks(delete_time);
CREATE INDEX idx_delete_circle_tasks_task_group_id ON delete_circle_tasks(task_group_id);

-- 添加注释
COMMENT ON TABLE delete_circle_tasks IS '跟圈删除任务表';
COMMENT ON COLUMN delete_circle_tasks.task_group_id IS '任务组ID,用于标识同一批跟圈任务';
COMMENT ON COLUMN delete_circle_tasks.circle_index IS '第几条朋友圈,从1开始';
COMMENT ON COLUMN delete_circle_tasks.delete_title IS '要删除的任务标题,用于精确匹配';
COMMENT ON COLUMN delete_circle_tasks.delete_content IS '朋友圈内容,用于双重验证防止误删';
COMMENT ON COLUMN delete_circle_tasks.delete_time IS '删除时间,到达此时间后执行删除';
COMMENT ON COLUMN delete_circle_tasks.status IS '任务状态: pending-待执行, completed-已完成, failed-失败';

