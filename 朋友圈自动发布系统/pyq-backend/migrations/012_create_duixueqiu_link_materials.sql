-- 创建堆雪球链接素材库表
-- 如果表已存在,先删除再重建(确保字段类型正确)
DROP TABLE IF EXISTS duixueqiu_link_materials CASCADE;

CREATE TABLE duixueqiu_link_materials (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,  -- 用户ID (UUID类型,关联users表)
  title VARCHAR(500) NOT NULL,  -- 文章标题
  account_name VARCHAR(200),  -- 公众号名称
  thumbnail_url TEXT,  -- 缩略图URL
  link_url TEXT,  -- 文章链接URL
  material_index INT,  -- 在素材库中的索引位置（用于定位）
  page_number INT DEFAULT 1,  -- 所在页码
  sync_time TIMESTAMP DEFAULT NOW(),  -- 同步时间
  create_time TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, thumbnail_url)  -- 防止重复(使用缩略图URL作为唯一标识)
);

-- 创建索引
CREATE INDEX idx_duixueqiu_link_materials_user_id ON duixueqiu_link_materials(user_id);
CREATE INDEX idx_duixueqiu_link_materials_title ON duixueqiu_link_materials(title);
CREATE INDEX idx_duixueqiu_link_materials_sync_time ON duixueqiu_link_materials(sync_time);

-- 添加外键约束(可选,但推荐)
ALTER TABLE duixueqiu_link_materials 
  ADD CONSTRAINT fk_duixueqiu_link_materials_user_id 
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 添加注释
COMMENT ON TABLE duixueqiu_link_materials IS '堆雪球链接素材库';
COMMENT ON COLUMN duixueqiu_link_materials.user_id IS '用户ID (UUID类型,关联users表)';
COMMENT ON COLUMN duixueqiu_link_materials.title IS '文章标题';
COMMENT ON COLUMN duixueqiu_link_materials.account_name IS '公众号名称';
COMMENT ON COLUMN duixueqiu_link_materials.thumbnail_url IS '文章缩略图URL';
COMMENT ON COLUMN duixueqiu_link_materials.link_url IS '文章链接URL';
COMMENT ON COLUMN duixueqiu_link_materials.material_index IS '素材在列表中的索引位置';
COMMENT ON COLUMN duixueqiu_link_materials.page_number IS '素材所在页码';
COMMENT ON COLUMN duixueqiu_link_materials.sync_time IS '最后同步时间';

