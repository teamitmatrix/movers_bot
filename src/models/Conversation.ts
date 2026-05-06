import { Model, Schema, model, models } from "mongoose";

import type { ServiceAddOnId } from "@/lib/bookingPricing";
import type { PricingItem } from "@/lib/pricing";

export type ConversationStatus = "active" | "booked" | "abandoned";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface PartialBookingData {
  pickupZip?: string;
  dropoffZip?: string;
  items?: PricingItem[];
  selectedAddOns?: ServiceAddOnId[];
  upsellReviewed?: boolean;
  discountApplied?: boolean;
  reminderCall?: boolean;
  afterHoursSession?: boolean;
  moveDate?: string;
  inventorySize?: string;
  leadCaptured?: boolean;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export interface ConversationDocument {
  sessionId: string;
  messages: StoredMessage[];
  partialData: PartialBookingData;
  status: ConversationStatus;
  orderId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const storedMessageSchema = new Schema<StoredMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
);

const pricingItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const partialDataSchema = new Schema<PartialBookingData>(
  {
    pickupZip: { type: String, trim: true },
    dropoffZip: { type: String, trim: true },
    items: { type: [pricingItemSchema], default: undefined },
    selectedAddOns: {
      type: [{ type: String, enum: ["same-day-service", "specialty-item-handling", "full-packing-service", "storage-unit-30-days", "furniture-disassembly"] }],
      default: undefined,
    },
    upsellReviewed: { type: Boolean, default: undefined },
    discountApplied: { type: Boolean, default: undefined },
    reminderCall: { type: Boolean, default: undefined },
    afterHoursSession: { type: Boolean, default: undefined },
    moveDate: { type: String, trim: true },
    inventorySize: { type: String, trim: true },
    leadCaptured: { type: Boolean, default: undefined },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
  },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    messages: {
      type: [storedMessageSchema],
      default: [],
    },
    partialData: {
      type: partialDataSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ["active", "booked", "abandoned"],
      default: "active",
    },
    orderId: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

// TTL: sessions expire after 24 hours of inactivity (set via expiresAt on creation)

const Conversation =
  (models.Conversation as Model<ConversationDocument>) ??
  model<ConversationDocument>("Conversation", conversationSchema);

export default Conversation;
