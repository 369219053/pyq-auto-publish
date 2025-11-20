-- 创建跟圈任务表
CREATE TABLE IF NOT EXISTS follow_circle_tasks (
  id SERIAL PRIMARY KEY,
  task_group_id VARCHAR(100) NOT NULL,  -- 任务组ID (例如: 跟圈_1730000000000)
  circle_index INT NOT NULL,             -- 第几条跟圈 (1, 2, 3...)
  content TEXT NOT NULL,                 -- 朋友圈内容
  images JSONB,                          -- 图片列表 [{url: '', base64: ''}]
  publish_time TIMESTAMP NOT NULL,       -- 发布时间
  delete_previous BOOLEAN DEFAULT false, -- 是否删除上一条
  previous_title VARCHAR(200),           -- 上一条的标题 (用于识别删除)
  status VARCHAR(20) DEFAULT 'pending',  -- pending/completed/failed
  error_message TEXT,                    -- 错误信息
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_follow_circle_tasks_group ON follow_circle_tasks(task_group_id);
CREATE INDEX IF NOT EXISTS idx_follow_circle_tasks_status ON follow_circle_tasks(status);
CREATE INDEX IF NOT EXISTS idx_follow_circle_tasks_publish_time ON follow_circle_tasks(publish_time);

-- 添加注释
COMMENT ON TABLE follow_circle_tasks IS '跟圈任务表 - 存储自动跟圈发布任务';
COMMENT ON COLUMN follow_circle_tasks.task_group_id IS '任务组ID,同一批跟圈任务共享';
COMMENT ON COLUMN follow_circle_tasks.circle_index IS '第几条跟圈,从1开始';
COMMENT ON COLUMN follow_circle_tasks.content IS '朋友圈文字内容';
COMMENT ON COLUMN follow_circle_tasks.images IS '图片列表JSON';
COMMENT ON COLUMN follow_circle_tasks.publish_time IS '计划发布时间';
COMMENT ON COLUMN follow_circle_tasks.delete_previous IS '是否需要删除上一条朋友圈';
COMMENT ON COLUMN follow_circle_tasks.previous_title IS '上一条朋友圈的标题,用于识别删除';
COMMENT ON COLUMN follow_circle_tasks.status IS '任务状态: pending-待执行, completed-已完成, failed-失败';

