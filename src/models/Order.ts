import { Model, Schema, model, models } from "mongoose";

import type { ServiceAddOnId } from "@/lib/bookingPricing";
import type { PricingItemType } from "@/lib/pricing";

export type OrderStatus = "pending" | "confirmed" | "completed" | "lead-follow-up";

export interface LocationDetails {
  address?: string;
  city?: string;
  state?: string;
  zip: string;
}

export interface OrderItem {
  type: PricingItemType;
  quantity: number;
}

export interface CustomerInfo {
  name: string;
  email?: string;
  phone: string;
}

export interface OrderDocument {
  orderNumber: number;
  pickup: LocationDetails;
  dropoff: LocationDetails;
  items: OrderItem[];
  customer: CustomerInfo;
  selectedAddOns?: ServiceAddOnId[];
  originalPrice?: number;
  discountApplied?: boolean;
  discountAmount?: number;
  moveDate?: string;
  inventorySize?: string;
  price: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<LocationDetails>(
  {
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    zip: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const itemSchema = new Schema<OrderItem>(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"],
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    _id: false,
  }
);

const customerSchema = new Schema<CustomerInfo>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const orderSchema = new Schema<OrderDocument>(
  {
    orderNumber: {
      type: Number,
      unique: true,
    },
    pickup: {
      type: locationSchema,
      required: true,
    },
    dropoff: {
      type: locationSchema,
      required: true,
    },
    items: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: (value: OrderItem[]) => value.length > 0,
        message: "At least one item is required.",
      },
    },
    customer: {
      type: customerSchema,
      required: true,
    },
    selectedAddOns: {
      type: [{ type: String, enum: ["full-packing-service", "storage-unit-30-days", "furniture-disassembly"] }],
      default: undefined,
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    discountApplied: {
      type: Boolean,
      default: false,
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    moveDate: {
      type: String,
      trim: true,
    },
    inventorySize: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "lead-follow-up"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const Order = (models.Order as Model<OrderDocument>) || model<OrderDocument>("Order", orderSchema);

/** Atomically assign the next order number (OID starts at 101). */
export async function assignOrderNumber(doc: InstanceType<typeof Order>): Promise<void> {
  if (doc.orderNumber) return; // already set
  const count = await Order.countDocuments();
  // Use count + 101 so the first order is OID-101 even before save increments the count
  doc.orderNumber = count + 101;
}

/** Format an order number as the human-readable ID, e.g. "OID-101". */
export function formatOrderId(orderNumber: number): string {
  return `OID-${orderNumber}`;
}

export default Order;