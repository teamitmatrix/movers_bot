import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import { calculateMovePrice, type PricingResult } from "@/lib/pricing";
import type { OrderDocument, OrderStatus } from "@/models/Order";
import Order, { formatOrderId } from "@/models/Order";

const logger = makeLogger("/api/orders/[id]");

const VALID_STATUSES: OrderStatus[] = ["pending", "confirmed", "completed", "lead-follow-up"];

function serializeOrder(order: OrderDocument & { _id: { toString(): string } }) {
  let priceBreakdown: PricingResult | null = null;

  try {
    priceBreakdown = calculateMovePrice({
      pickup_zip: order.pickup.zip,
      dropoff_zip: order.dropoff.zip,
      items: order.items,
    });
  } catch {
    priceBreakdown = null;
  }

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
    customer: order.customer,
    moveDate: order.moveDate ?? null,
    inventorySize: order.inventorySize ?? null,
    status: order.status,
    priceBreakdown,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
    }

    await connectToDatabase();

    const order = await Order.findById(id).lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({
      order: serializeOrder(order as OrderDocument & { _id: { toString(): string } }),
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/orders/[id]");
  }
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    }) as { status?: OrderStatus };

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: "status must be one of: pending, confirmed, completed, lead-follow-up." },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const order = await Order.findByIdAndUpdate(
      id,
      { status: body.status },
      { new: true, runValidators: true }
    ).lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    logger.info("Order status updated", { orderId: id, status: body.status });

    return NextResponse.json({
      order: serializeOrder(order as OrderDocument & { _id: { toString(): string } }),
    });
  } catch (error) {
    return toErrorResponse(error, "PATCH /api/orders/[id]");
  }
}