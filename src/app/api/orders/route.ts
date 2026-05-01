import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";
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

const VALID_STATUSES: OrderStatus[] = ["pending", "confirmed", "completed"];

function serializeOrder(order: OrderDocument & { _id: { toString(): string } }) {
  return {
    id: order._id.toString(),
    displayId: order.orderNumber ? formatOrderId(order.orderNumber) : order._id.toString(),
    orderNumber: order.orderNumber ?? null,
    pickup: order.pickup,
    dropoff: order.dropoff,
    items: order.items,
    price: order.price,
    customer: order.customer,
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

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push("status must be one of: pending, confirmed, completed.");
  }

  return errors;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

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
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

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
      customer: body.customer,
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