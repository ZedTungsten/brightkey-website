-- ============================================================
-- Migration: 25_add_packed_photo_url_to_inventory_transactions.sql
-- Adds packed_photo_url to inventory_transactions to store proof
-- of packing photo.
-- ============================================================

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS packed_photo_url TEXT;
