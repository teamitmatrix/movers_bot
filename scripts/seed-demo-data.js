const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const mongodbUri = process.env.MONGODB_URI;

if (!mongodbUri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"],
    },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: Number, unique: true },
    pickup: { type: locationSchema, required: true },
    dropoff: { type: locationSchema, required: true },
    items: { type: [itemSchema], required: true },
    customer: { type: customerSchema, required: true },
    selectedAddOns: {
      type: [{ type: String, enum: ["full-packing-service", "storage-unit-30-days", "furniture-disassembly"] }],
      default: undefined,
    },
    originalPrice: { type: Number, min: 0 },
    discountApplied: { type: Boolean, default: false },
    discountAmount: { type: Number, min: 0, default: 0 },
    moveDate: { type: String, trim: true },
    inventorySize: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "lead-follow-up"],
      default: "pending",
    },
  },
  { timestamps: true }
);

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

const demoOrders = [
  {
    pickup: { city: "Austin", state: "TX", zip: "78701" },
    dropoff: { city: "Dallas", state: "TX", zip: "75201" },
    items: [
      { type: "bed", quantity: 2 },
      { type: "boxes", quantity: 18 },
      { type: "sofa", quantity: 1 },
    ],
    customer: {
      name: "Jordan Miles",
      phone: "(555) 410-1001",
      email: "jordan.demo@vanturo.example",
    },
    selectedAddOns: ["full-packing-service", "furniture-disassembly"],
    originalPrice: 1225,
    discountApplied: true,
    discountAmount: 122.5,
    price: 1102.5,
    moveDate: "May 18, 2026",
    inventorySize: "2-3 bedroom home",
    status: "confirmed",
  },
  {
    pickup: { city: "Brooklyn", state: "NY", zip: "11201" },
    dropoff: { city: "Jersey City", state: "NJ", zip: "07302" },
    items: [
      { type: "boxes", quantity: 10 },
      { type: "wardrobe", quantity: 1 },
    ],
    customer: {
      name: "Casey Nguyen",
      phone: "(555) 410-1002",
      email: "casey.demo@vanturo.example",
    },
    selectedAddOns: ["storage-unit-30-days"],
    originalPrice: 689,
    discountApplied: false,
    discountAmount: 0,
    price: 689,
    moveDate: "May 27, 2026",
    inventorySize: "Studio / 1 bed",
    status: "lead-follow-up",
  },
  {
    pickup: { city: "Phoenix", state: "AZ", zip: "85004" },
    dropoff: { city: "Scottsdale", state: "AZ", zip: "85251" },
    items: [
      { type: "appliance", quantity: 1 },
      { type: "boxes", quantity: 6 },
    ],
    customer: {
      name: "Taylor Brooks",
      phone: "(555) 410-1003",
      email: "taylor.demo@vanturo.example",
    },
    selectedAddOns: [],
    originalPrice: 420,
    discountApplied: false,
    discountAmount: 0,
    price: 420,
    moveDate: "Jun 2, 2026",
    inventorySize: "Just a few items",
    status: "pending",
  },
];

async function seedDemoOrders() {
  await mongoose.connect(mongodbUri, { bufferCommands: false });

  const existingDemoOrders = await Order.find(
    { "customer.email": { $in: demoOrders.map((order) => order.customer.email) } },
    { "customer.email": 1, orderNumber: 1 }
  ).lean();

  const existingEmails = new Set(existingDemoOrders.map((order) => order.customer?.email));
  const maxOrder = await Order.findOne({}, { orderNumber: 1 }).sort({ orderNumber: -1 }).lean();
  let nextOrderNumber = Number(maxOrder?.orderNumber ?? 100);

  let inserted = 0;
  let updated = 0;

  for (const demoOrder of demoOrders) {
    if (existingEmails.has(demoOrder.customer.email)) {
      await Order.updateOne(
        { "customer.email": demoOrder.customer.email },
        {
          $set: {
            pickup: demoOrder.pickup,
            dropoff: demoOrder.dropoff,
            items: demoOrder.items,
            customer: demoOrder.customer,
            selectedAddOns: demoOrder.selectedAddOns,
            originalPrice: demoOrder.originalPrice,
            discountApplied: demoOrder.discountApplied,
            discountAmount: demoOrder.discountAmount,
            price: demoOrder.price,
            moveDate: demoOrder.moveDate,
            inventorySize: demoOrder.inventorySize,
            status: demoOrder.status,
          },
        }
      );
      updated += 1;
      continue;
    }

    nextOrderNumber += 1;
    await Order.create({
      ...demoOrder,
      orderNumber: nextOrderNumber,
    });
    inserted += 1;
  }

  await mongoose.disconnect();
  console.log(`Demo orders seeded successfully. Inserted: ${inserted}, updated: ${updated}.`);
}

seedDemoOrders().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});