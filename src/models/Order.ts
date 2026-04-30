import { Model, Schema, model, models } from "mongoose";

import type { PricingItemType } from "@/lib/pricing";

export type OrderStatus = "pending" | "confirmed" | "completed";

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
  pickup: LocationDetails;
  dropoff: LocationDetails;
  items: OrderItem[];
  customer: CustomerInfo;
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
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const Order = (models.Order as Model<OrderDocument>) || model<OrderDocument>("Order", orderSchema);

export default Order;