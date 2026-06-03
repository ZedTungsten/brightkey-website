-- Migration 36: Align bookkeeping tables to canonical schema
-- Renames columns and adds missing fields across bookkeeping, bookkeeping_lines, bookkeeping_attachments.

-- ── bookkeeping ──────────────────────────────────────────────────────────────

-- Rename date → transaction_date
ALTER TABLE public.bookkeeping RENAME COLUMN date TO transaction_date;

-- Rename entry_number → entry_no
ALTER TABLE public.bookkeeping RENAME COLUMN entry_number TO entry_no;

-- Add amount (integer centavos — e.g. 10000 = ₱100.00)
ALTER TABLE public.bookkeeping ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 0;

-- Add status
ALTER TABLE public.bookkeeping ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

-- Add updated_at
ALTER TABLE public.bookkeeping ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ── bookkeeping_lines ─────────────────────────────────────────────────────────

-- Rename notes → description
ALTER TABLE public.bookkeeping_lines RENAME COLUMN notes TO description;

-- Add created_at
ALTER TABLE public.bookkeeping_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ── bookkeeping_attachments ───────────────────────────────────────────────────

-- Rename file_url → file_path
ALTER TABLE public.bookkeeping_attachments RENAME COLUMN file_url TO file_path;

-- Add file_type
ALTER TABLE public.bookkeeping_attachments ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Add file_size (bytes)
ALTER TABLE public.bookkeeping_attachments ADD COLUMN IF NOT EXISTS file_size BIGINT;
