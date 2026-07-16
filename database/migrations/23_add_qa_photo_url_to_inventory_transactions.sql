-- =============================================================================
-- 23_add_qa_photo_url_to_inventory_transactions.sql
-- Add qa_photo_url to public.inventory_transactions table.
-- =============================================================================

ALTER TABLE public.inventory_transactions ADD COLUMN IF NOT EXISTS qa_photo_url TEXT;
