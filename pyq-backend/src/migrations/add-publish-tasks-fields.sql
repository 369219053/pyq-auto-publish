-- 添加新字段到publish_tasks表
ALTER TABLE publish_tasks 
ADD COLUMN IF NOT EXISTS visibility_range VARCHAR(50) DEFAULT 'all',
ADD COLUMN IF NOT EXISTS selected_tags TEXT[],
ADD COLUMN IF NOT EXISTS comments TEXT[],
ADD COLUMN IF NOT EXISTS use_location BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS random_content TEXT,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

-- 添加注释
COMMENT ON COLUMN publish_tasks.visibility_range IS '可见范围: all/private/include_tags/exclude_tags/include_tags_dynamic/exclude_tags_dynamic';
COMMENT ON COLUMN publish_tasks.selected_tags IS '选择的标签列表';
COMMENT ON COLUMN publish_tasks.comments IS '追评论列表';
COMMENT ON COLUMN publish_tasks.use_location IS '是否使用定位';
COMMENT ON COLUMN publish_tasks.random_content IS '随机补充内容(用;分隔)';
COMMENT ON COLUMN publish_tasks.end_time IS '任务结束时间';

