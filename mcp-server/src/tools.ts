import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError, get, post } from './api.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  const message = error instanceof ApiError ? error.message : String(error);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

const orderParam = z
  .string()
  .describe('Order number (e.g. "ORD-1101") or order UUID');
const reasonParam = z
  .string()
  .min(1)
  .describe('Why this action is being taken — recorded in the audit log');
const actorParam = z
  .string()
  .optional()
  .describe('Name of the ops person requesting this (defaults to "ops-agent")');

export function registerTools(server: McpServer): void {
  // ------------------------- Read / diagnostic tools -------------------------

  server.registerTool(
    'ops_summary',
    {
      title: 'Operations health summary',
      description:
        'Get a fleet-wide Order-to-Cash health summary: order counts by status, stuck payments, paid orders without shipments, missing/mismatched invoices, pending refunds, and inventory reservation mismatches. Start here when asked "what needs attention?".',
      inputSchema: {},
    },
    () => run(() => get('/ops/summary')),
  );

  server.registerTool(
    'search_orders',
    {
      title: 'Search orders',
      description:
        'Search orders by status, customer email, free text (order number or customer name), or find orders stuck in a non-terminal status for more than N hours.',
      inputSchema: {
        status: z
          .enum([
            'CREATED',
            'PAYMENT_PENDING',
            'PAID',
            'FULFILLING',
            'SHIPPED',
            'DELIVERED',
            'COMPLETED',
            'CANCELLED',
            'REFUNDED',
          ])
          .optional()
          .describe('Filter by order status'),
        email: z.string().optional().describe('Filter by customer email (partial match)'),
        q: z.string().optional().describe('Free text: order number or customer name'),
        stuckHours: z
          .number()
          .optional()
          .describe('Only orders in a non-terminal status not updated for at least this many hours'),
        limit: z.number().int().max(200).optional().describe('Max results (default 50)'),
      },
    },
    (args: { status?: string; email?: string; q?: string; stuckHours?: number; limit?: number }) =>
      run(() => get('/orders', args)),
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get order details',
      description:
        'Get the full Order-to-Cash timeline for one order: items, customer, payments (with refunds), shipments, invoice, and the audit trail of past ops actions.',
      inputSchema: { order: orderParam },
    },
    ({ order }: { order: string }) => run(() => get(`/orders/${encodeURIComponent(order)}`)),
  );

  server.registerTool(
    'diagnose_order',
    {
      title: 'Diagnose an order',
      description:
        'Run rule-based diagnostics on an order. Returns detected issues (failed payments, missing shipments/invoices, pending refunds, leaked stock reservations, ...) with severity and the suggested fix tool for each. ALWAYS run this before applying a fix so you address the root cause.',
      inputSchema: { order: orderParam },
    },
    ({ order }: { order: string }) => run(() => get(`/ops/diagnose/${encodeURIComponent(order)}`)),
  );

  server.registerTool(
    'get_inventory',
    {
      title: 'View inventory',
      description:
        'List products with stock, reserved, and available quantities. Optionally filter by SKU (partial match).',
      inputSchema: { sku: z.string().optional().describe('SKU filter, partial match') },
    },
    ({ sku }: { sku?: string }) => run(() => get('/inventory', { sku })),
  );

  server.registerTool(
    'reconcile_inventory',
    {
      title: 'Reconcile inventory reservations',
      description:
        'Compare recorded stock reservations against what open orders actually hold. Reports per-SKU mismatches (e.g. reservations leaked by cancelled orders) with guidance on fixing them.',
      inputSchema: {},
    },
    () => run(() => get('/inventory/reconcile')),
  );

  server.registerTool(
    'get_audit_log',
    {
      title: 'Query audit log',
      description:
        'Query the audit log of all ops actions: who did what, when, and why, with before/after snapshots. Filter by order UUID, actor, action name, or start date.',
      inputSchema: {
        orderId: z.string().optional().describe('Order UUID (from get_order)'),
        actor: z.string().optional(),
        action: z.string().optional().describe('e.g. "payment.retry", "order.cancel"'),
        since: z.string().optional().describe('ISO date, e.g. "2026-07-01"'),
        limit: z.number().int().max(200).optional(),
      },
    },
    (args: { orderId?: string; actor?: string; action?: string; since?: string; limit?: number }) =>
      run(() => get('/audit', args)),
  );

  // ----------------------------- Payment tools ------------------------------

  server.registerTool(
    'retry_payment',
    {
      title: 'Retry a payment',
      description:
        'Retry a pending or failed payment through the payment gateway. On success the payment is captured and the order advances to PAID. If the payment failed with a gateway timeout, run reconcile_payment first to avoid double-charging the customer.',
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/payments/retry`, { reason, actor })),
  );

  server.registerTool(
    'reconcile_payment',
    {
      title: 'Reconcile payment with gateway',
      description:
        "Check the payment gateway's records for a payment our system recorded as failed (e.g. after a gateway timeout). If the gateway actually captured the charge, the payment is corrected to CAPTURED and the order advances — without charging the customer again.",
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/payments/reconcile`, { reason, actor })),
  );

  server.registerTool(
    'issue_refund',
    {
      title: 'Issue a refund',
      description:
        'Issue a refund on a captured payment. Omit amount for a full refund (or to process an already-pending refund request). A full refund moves the order to REFUNDED and releases any reserved stock.',
      inputSchema: {
        order: orderParam,
        amount: z.number().positive().optional().describe('Partial refund amount; omit for full refund'),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ order, amount, reason, actor }: { order: string; amount?: number; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/refunds`, { amount, reason, actor })),
  );

  // ------------------------------ Order tools -------------------------------

  server.registerTool(
    'cancel_order',
    {
      title: 'Cancel an order',
      description:
        'Cancel an order that has not shipped yet. Releases any stock reserved for it. Orders that already shipped or were delivered must be refunded instead.',
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/cancel`, { reason, actor })),
  );

  server.registerTool(
    'force_order_status',
    {
      title: 'Force order status transition',
      description:
        'Force an order to the next status in the Order-to-Cash flow (e.g. a stale order whose payment is already captured). Only valid forward transitions are allowed; inventory is kept consistent automatically. Use as a last resort after diagnose_order — prefer the specific fix tools.',
      inputSchema: {
        order: orderParam,
        status: z
          .enum([
            'PAYMENT_PENDING',
            'PAID',
            'FULFILLING',
            'SHIPPED',
            'DELIVERED',
            'COMPLETED',
            'CANCELLED',
            'REFUNDED',
          ])
          .describe('Target status'),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ order, status, reason, actor }: { order: string; status: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/force-status`, { status, reason, actor })),
  );

  // ----------------------------- Inventory tools ----------------------------

  server.registerTool(
    'adjust_inventory',
    {
      title: 'Adjust stock quantity',
      description:
        'Adjust a product\'s physical stock quantity by a positive or negative amount (e.g. after a warehouse recount or damaged goods write-off).',
      inputSchema: {
        sku: z.string().describe('Product SKU, e.g. "SKU-WATCH"'),
        quantityChange: z.number().int().describe('Positive to add stock, negative to remove'),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ sku, quantityChange, reason, actor }: { sku: string; quantityChange: number; reason: string; actor?: string }) =>
      run(() => post('/inventory/adjust', { sku, quantityChange, reason, actor })),
  );

  server.registerTool(
    'release_reservations',
    {
      title: 'Release leaked stock reservations',
      description:
        'Release stock reservations still held by a cancelled/refunded order (a "leaked" reservation that makes stock look unavailable). Use reconcile_inventory first to find affected SKUs and orders.',
      inputSchema: {
        order: z.string().describe('Order number of the terminal (cancelled/refunded) order holding the leak'),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post('/inventory/release-reservations', { orderNumber: order, reason, actor })),
  );

  // ---------------------------- Fulfillment tools ---------------------------

  server.registerTool(
    'create_shipment',
    {
      title: 'Create a shipment',
      description:
        'Create a shipment for a PAID or FULFILLING order that fulfillment missed. If a tracking number is provided the order is marked SHIPPED immediately and stock is decremented.',
      inputSchema: {
        order: orderParam,
        carrier: z.string().describe('Carrier name, e.g. "FedEx", "UPS", "DHL"'),
        trackingNumber: z.string().optional().describe('Tracking number if already handed to the carrier'),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ order, carrier, trackingNumber, reason, actor }: { order: string; carrier: string; trackingNumber?: string; reason: string; actor?: string }) =>
      run(() =>
        post(`/orders/${encodeURIComponent(order)}/shipments`, { carrier, trackingNumber, reason, actor }),
      ),
  );

  server.registerTool(
    'update_shipment_tracking',
    {
      title: 'Update shipment tracking',
      description:
        'Attach or correct the tracking number on an order\'s open shipment. Marks the order SHIPPED (and decrements stock) if it was not already.',
      inputSchema: {
        order: orderParam,
        trackingNumber: z.string(),
        reason: reasonParam,
        actor: actorParam,
      },
    },
    ({ order, trackingNumber, reason, actor }: { order: string; trackingNumber: string; reason: string; actor?: string }) =>
      run(() =>
        post(`/orders/${encodeURIComponent(order)}/shipments/tracking`, { trackingNumber, reason, actor }),
      ),
  );

  server.registerTool(
    'mark_delivered',
    {
      title: 'Mark shipment delivered',
      description:
        'Mark an order\'s shipment as delivered (e.g. the carrier confirmed delivery but the webhook was missed). Moves the order to DELIVERED.',
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/shipments/delivered`, { reason, actor })),
  );

  // ------------------------------ Invoice tools -----------------------------

  server.registerTool(
    'generate_invoice',
    {
      title: 'Generate missing invoice',
      description:
        'Generate the invoice for a shipped/delivered/completed order that is missing one. The invoice amount is taken from the order total.',
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/invoice`, { reason, actor })),
  );

  server.registerTool(
    'regenerate_invoice',
    {
      title: 'Regenerate incorrect invoice',
      description:
        "Void an order's current invoice and issue a corrected one at the order total. Use when diagnose_order reports an invoice amount mismatch.",
      inputSchema: { order: orderParam, reason: reasonParam, actor: actorParam },
    },
    ({ order, reason, actor }: { order: string; reason: string; actor?: string }) =>
      run(() => post(`/orders/${encodeURIComponent(order)}/invoice/regenerate`, { reason, actor })),
  );
}
