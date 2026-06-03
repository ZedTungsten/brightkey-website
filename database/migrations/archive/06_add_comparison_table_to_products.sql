-- Migration: Add comparison_table JSONB column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS comparison_table JSONB;
