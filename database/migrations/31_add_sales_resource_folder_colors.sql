-- Optional pastel color selection for Resources folders.
ALTER TABLE public.sales_resources
  ADD COLUMN IF NOT EXISTS folder_color TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_resources_folder_color_valid'
      AND conrelid = 'public.sales_resources'::regclass
  ) THEN
    ALTER TABLE public.sales_resources
      ADD CONSTRAINT sales_resources_folder_color_valid
      CHECK (
        folder_color IS NULL
        OR (
          type = 'folder'
          AND folder_color IN (
            'cyan', 'blue', 'lavender', 'rose',
            'peach', 'yellow', 'mint', 'gray'
          )
        )
      );
  END IF;
END $$;
