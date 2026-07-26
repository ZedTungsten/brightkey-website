CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_reserved_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_reserved)
  WHERE timestamp_reserved IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_dispatched_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_dispatched)
  WHERE timestamp_dispatched IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_returned_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_returned)
  WHERE timestamp_returned IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tx_company_warehouse_cancelled_at
  ON public.inventory_transactions (company_id, warehouse_id, timestamp_cancelled)
  WHERE timestamp_cancelled IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_inventory_monthly_stats(
  p_company_id UUID,
  p_warehouse_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS TABLE (
  sku TEXT,
  reserved BIGINT,
  dispatched BIGINT,
  returned BIGINT,
  cancelled BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    transaction.sku,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_reserved >= p_period_start
        AND transaction.timestamp_reserved < p_period_end
    ), 0)::BIGINT AS reserved,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_dispatched >= p_period_start
        AND transaction.timestamp_dispatched < p_period_end
    ), 0)::BIGINT AS dispatched,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_returned >= p_period_start
        AND transaction.timestamp_returned < p_period_end
    ), 0)::BIGINT AS returned,
    COALESCE(sum(transaction.quantity) FILTER (
      WHERE transaction.timestamp_cancelled >= p_period_start
        AND transaction.timestamp_cancelled < p_period_end
    ), 0)::BIGINT AS cancelled
  FROM public.inventory_transactions AS transaction
  WHERE transaction.company_id = p_company_id
    AND transaction.warehouse_id = p_warehouse_id
    AND (
      (transaction.timestamp_reserved >= p_period_start AND transaction.timestamp_reserved < p_period_end)
      OR (transaction.timestamp_dispatched >= p_period_start AND transaction.timestamp_dispatched < p_period_end)
      OR (transaction.timestamp_returned >= p_period_start AND transaction.timestamp_returned < p_period_end)
      OR (transaction.timestamp_cancelled >= p_period_start AND transaction.timestamp_cancelled < p_period_end)
    )
  GROUP BY transaction.sku;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_monthly_stats(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inventory_monthly_stats(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated;
