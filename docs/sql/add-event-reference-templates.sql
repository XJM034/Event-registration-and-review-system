-- 为赛事增加“参考模板”多附件字段（JSONB 数组）
-- 执行时间：2026-03-03

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS reference_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.events.reference_templates IS '赛事参考模板附件列表，供报名端下载';
