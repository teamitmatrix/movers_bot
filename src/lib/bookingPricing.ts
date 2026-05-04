import type { PricingResult } from "@/lib/pricing";

export type ServiceAddOnId =
  | "full-packing-service"
  | "storage-unit-30-days"
  | "furniture-disassembly";

export type ServiceAddOn = {
  id: ServiceAddOnId;
  label: string;
  shortLabel: string;
  price: number;
  emoji: string;
};

export type QuoteAdjustmentSummary = {
  baseTotal: number;
  addOnTotal: number;
  subtotal: number;
  discountApplied: boolean;
  discountAmount: number;
  finalTotal: number;
  selectedAddOnIds: ServiceAddOnId[];
  selectedAddOns: ServiceAddOn[];
};

export const SERVICE_ADDONS: ServiceAddOn[] = [
  {
    id: "full-packing-service",
    label: "📦 Full Packing Service (+$150)",
    shortLabel: "Full Packing Service",
    price: 150,
    emoji: "📦",
  },
  {
    id: "storage-unit-30-days",
    label: "🏪 Storage Unit — 30 days (+$99)",
    shortLabel: "Storage Unit — 30 days",
    price: 99,
    emoji: "🏪",
  },
  {
    id: "furniture-disassembly",
    label: "🛋️ Furniture Disassembly (+$75)",
    shortLabel: "Furniture Disassembly",
    price: 75,
    emoji: "🛋️",
  },
];

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

export function isServiceAddOnId(value: unknown): value is ServiceAddOnId {
  return SERVICE_ADDONS.some((addOn) => addOn.id === value);
}

export function getSelectedAddOns(addOnIds: ServiceAddOnId[] = []) {
  return SERVICE_ADDONS.filter((addOn) => addOnIds.includes(addOn.id));
}

export function buildQuoteAdjustmentSummary(
  priceQuote: PricingResult,
  addOnIds: ServiceAddOnId[] = [],
  discountApplied = false
): QuoteAdjustmentSummary {
  const selectedAddOns = getSelectedAddOns(addOnIds);
  const addOnTotal = roundToTwo(
    selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0)
  );
  const subtotal = roundToTwo(priceQuote.totalPrice + addOnTotal);
  const discountAmount = discountApplied ? roundToTwo(subtotal * 0.1) : 0;

  return {
    baseTotal: priceQuote.totalPrice,
    addOnTotal,
    subtotal,
    discountApplied,
    discountAmount,
    finalTotal: roundToTwo(subtotal - discountAmount),
    selectedAddOnIds: addOnIds,
    selectedAddOns,
  };
}