import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
import { SERVICE_ADDONS, type ServiceAddOnId } from "@/lib/bookingPricing";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import type { PricingItemType } from "@/lib/pricing";
import Order, {
  type CustomerInfo,
  type LocationDetails,
  type OrderDocument,
  type OrderItem,
  type OrderStatus,
  formatOrderId,
} from "@/models/Order";

const logger = makeLogger("/api/orders");

type CreateOrderRequest = {
  pickup?: LocationDetails;
  dropoff?: LocationDetails;
  items?: OrderItem[];
  price?: number;
  customer?: CustomerInfo;
  selectedAddOns?: ServiceAddOnId[];
  originalPrice?: number;
  discountApplied?: boolean;
  discountAmount?: number;
  reminderCall?: boolean;
  afterHours?: boolean;
  moveDate?: string;
  inventorySize?: string;
  status?: OrderStatus;
};

const VALID_ITEM_TYPES: PricingItemType[] = [
  "bed",
  "sofa",
  "wardrobe",
  "appliance",
  "boxes",
  "piano",
];

const VALID_STATUSES: OrderStatus[] = ["pending", "confirmed", "completed", "lead-follow-up"];
const VALID_ADD_ONS = SERVICE_ADDONS.map((addOn) => addOn.id);

function serializeOrder(order: OrderDocument & { _id: { toString(): string } }) {
  return {
    id: order._id.toString(),
    displayId: order.orderNumber ? formatOrderId(order.orderNumber) : order._id.toString(),
    orderNumber: order.orderNumber ?? null,
    pickup: order.pickup,
    dropoff: order.dropoff,
    items: order.items,
    price: order.price,
    selectedAddOns: order.selectedAddOns ?? [],
    originalPrice: order.originalPrice ?? null,
    discountApplied: order.discountApplied ?? false,
    discountAmount: order.discountAmount ?? 0,
    reminderCall: order.reminderCall ?? null,
    afterHours: order.afterHours ?? false,
    customer: order.customer,
    moveDate: order.moveDate ?? null,
    inventorySize: order.inventorySize ?? null,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isValidLocation(value: unknown): value is LocationDetails {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Record<string, unknown>;

  return (
    isNonEmptyString(location.zip) &&
    isOptionalString(location.address) &&
    isOptionalString(location.city) &&
    isOptionalString(location.state)
  );
}

function isValidItem(value: unknown): value is OrderItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.type === "string" &&
    VALID_ITEM_TYPES.includes(item.type as PricingItemType) &&
    Number.isInteger(item.quantity) &&
    Number(item.quantity) > 0
  );
}

function isValidCustomer(value: unknown): value is CustomerInfo {
  if (!value || typeof value !== "object") {
    return false;
  }

  const customer = value as Record<string, unknown>;

  return (
    isNonEmptyString(customer.name) &&
    isNonEmptyString(customer.phone) &&
    isOptionalString(customer.email)
  );
}

function validateOrderInput(body: CreateOrderRequest) {
  const errors: string[] = [];

  if (!isValidLocation(body.pickup)) {
    errors.push("pickup is required and must include a valid zip.");
  }

  if (!isValidLocation(body.dropoff)) {
    errors.push("dropoff is required and must include a valid zip.");
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || !body.items.every(isValidItem)) {
    errors.push("items must be a non-empty array of valid item types and quantities.");
  }

  if (!isValidCustomer(body.customer)) {
    errors.push("customer is required and must include name and phone.");
  }

  if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0) {
    errors.push("price must be a non-negative number.");
  }

  if (
    body.selectedAddOns !== undefined &&
    (!Array.isArray(body.selectedAddOns) ||
      !body.selectedAddOns.every((value) => typeof value === "string" && VALID_ADD_ONS.includes(value)))
  ) {
    errors.push("selectedAddOns must be a valid array of add-on identifiers.");
  }

  if (
    body.originalPrice !== undefined &&
    (typeof body.originalPrice !== "number" || !Number.isFinite(body.originalPrice) || body.originalPrice < 0)
  ) {
    errors.push("originalPrice must be a non-negative number.");
  }

  if (body.discountApplied !== undefined && typeof body.discountApplied !== "boolean") {
    errors.push("discountApplied must be a boolean.");
  }

  if (
    body.discountAmount !== undefined &&
    (typeof body.discountAmount !== "number" || !Number.isFinite(body.discountAmount) || body.discountAmount < 0)
  ) {
    errors.push("discountAmount must be a non-negative number.");
  }

  if (body.reminderCall !== undefined && typeof body.reminderCall !== "boolean") {
    errors.push("reminderCall must be a boolean.");
  }

  if (body.afterHours !== undefined && typeof body.afterHours !== "boolean") {
    errors.push("afterHours must be a boolean.");
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push("status must be one of: pending, confirmed, completed, lead-follow-up.");
  }

  return errors;
}

export async function GET() {
  try {
    await connectToDatabase();

    const orders = await Order.find().sort({ createdAt: -1 }).lean();

    logger.info("Orders listed", { count: orders.length });

    return NextResponse.json({
      orders: orders.map((order) =>
        serializeOrder(order as OrderDocument & { _id: { toString(): string } })
      ),
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/orders");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    }) as CreateOrderRequest;
    const errors = validateOrderInput(body);

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    await connectToDatabase();

    const order = await Order.create({
      pickup: body.pickup,
      dropoff: body.dropoff,
      items: body.items,
      price: body.price,
      selectedAddOns: body.selectedAddOns,
      originalPrice: body.originalPrice,
      discountApplied: body.discountApplied,
      discountAmount: body.discountAmount,
      reminderCall: body.reminderCall,
      afterHours: body.afterHours,
      customer: body.customer,
      moveDate: body.moveDate,
      inventorySize: body.inventorySize,
      status: body.status ?? "pending",
    });

    const createdOrder = order.toObject() as OrderDocument & { _id: { toString(): string } };
    logger.info("Order created via API", { orderId: createdOrder._id.toString() });

    return NextResponse.json(
      {
        order: serializeOrder(createdOrder),
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error, "POST /api/orders");
  }
}

export async function DELETE() {
  try {
    await connectToDatabase();

    const result = await Order.deleteMany({});
    logger.info("Orders cleared", { deletedCount: result.deletedCount ?? 0 });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount ?? 0,
    });
  } catch (error) {
    return toErrorResponse(error, "DELETE /api/orders");
  }
}