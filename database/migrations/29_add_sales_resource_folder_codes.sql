-- Shareable, tenant-protected URLs for native Resources folders.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS folder_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_resource_folder_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
  result TEXT := '';
  random_bytes BYTEA := gen_random_bytes(14);
  i INTEGER;
BEGIN
  FOR i IN 0..13 LOOP
    result := result || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

DO $$
DECLARE
  folder RECORD;
  candidate TEXT;
BEGIN
  FOR folder IN
    SELECT id
    FROM public.sales_resources
    WHERE type = 'folder'
      AND file_url IS NULL
      AND folder_code IS NULL
  LOOP
    LOOP
      candidate := public.generate_resource_folder_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.sales_resources WHERE folder_code = candidate
      );
    END LOOP;

    UPDATE public.sales_resources
    SET folder_code = candidate
    WHERE id = folder.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_resources_folder_code_unique
  ON public.sales_resources (folder_code)
  WHERE folder_code IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_folder_code_format'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_folder_code_format
      CHECK (
        folder_code IS NULL
        OR (
          type = 'folder'
          AND file_url IS NULL
          AND folder_code ~ '^[A-Za-z0-9_-]{14}$'
        )
      );
  END IF;
END $$;
