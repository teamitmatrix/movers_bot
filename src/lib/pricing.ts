export type PricingItemType =
  | "bed"
  | "sofa"
  | "wardrobe"
  | "appliance"
  | "boxes"
  | "piano";

export type PricingItem = {
  type: PricingItemType;
  quantity: number;
};

export type ZipCoordinates = {
  latitude: number;
  longitude: number;
};

export type ItemBreakdown = {
  type: PricingItemType;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type PricingResult = {
  distance: number;
  basePrice: number;
  itemCost: number;
  totalPrice: number;
  breakdown: {
    pricingTier: string;
    pickupZip: string;
    dropoffZip: string;
    items: ItemBreakdown[];
  };
};

const EARTH_RADIUS_MILES = 3958.8;

const ITEM_PRICES: Record<PricingItemType, number> = {
  bed: 80,
  sofa: 60,
  wardrobe: 70,
  appliance: 90,
  boxes: 20,
  piano: 300,
};

function validateZip(zip: string, fieldName: string) {
  if (!/^\d{5}$/.test(zip)) {
    throw new Error(`${fieldName} must be a valid 5-digit ZIP code.`);
  }
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

export function zipToCoordinates(zip: string): ZipCoordinates {
  validateZip(zip, "ZIP code");

  const seed = Number.parseInt(zip, 10);
  const latitude = 24.5 + (seed % 2500) / 100;
  const longitude = -124.5 + (seed % 5800) / 100;

  return {
    latitude: roundToTwo(latitude),
    longitude: roundToTwo(longitude),
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMiles(
  pickupCoordinates: ZipCoordinates,
  dropoffCoordinates: ZipCoordinates
) {
  const latitudeDelta = toRadians(
    dropoffCoordinates.latitude - pickupCoordinates.latitude
  );
  const longitudeDelta = toRadians(
    dropoffCoordinates.longitude - pickupCoordinates.longitude
  );
  const pickupLatitude = toRadians(pickupCoordinates.latitude);
  const dropoffLatitude = toRadians(dropoffCoordinates.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(pickupLatitude) *
      Math.cos(dropoffLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return roundToTwo(EARTH_RADIUS_MILES * arc);
}

function getBasePrice(distance: number) {
  if (distance <= 50) {
    return { pricingTier: "0-50 miles", basePrice: 150 };
  }

  if (distance <= 200) {
    return { pricingTier: "50-200 miles", basePrice: 400 };
  }

  if (distance <= 1000) {
    return { pricingTier: "200-1000 miles", basePrice: 1200 };
  }

  return { pricingTier: "1000+ miles", basePrice: 2500 };
}

function calculateItemCost(items: PricingItem[]) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array.");
  }

  const breakdown: ItemBreakdown[] = items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error("Each item quantity must be a positive integer.");
    }

    const unitPrice = ITEM_PRICES[item.type];

    if (!unitPrice) {
      throw new Error(`Unsupported item type: ${item.type}`);
    }

    const total =
      item.type === "boxes"
        ? Math.ceil(item.quantity / 10) * unitPrice
        : item.quantity * unitPrice;

    return {
      type: item.type,
      quantity: item.quantity,
      unitPrice,
      total,
    };
  });

  return {
    itemCost: breakdown.reduce((sum, item) => sum + item.total, 0),
    breakdown,
  };
}

export function calculateMovePrice(params: {
  pickup_zip: string;
  dropoff_zip: string;
  items: PricingItem[];
}): PricingResult {
  validateZip(params.pickup_zip, "pickup_zip");
  validateZip(params.dropoff_zip, "dropoff_zip");

  const pickupCoordinates = zipToCoordinates(params.pickup_zip);
  const dropoffCoordinates = zipToCoordinates(params.dropoff_zip);
  const distance = calculateDistanceMiles(pickupCoordinates, dropoffCoordinates);
  const { pricingTier, basePrice } = getBasePrice(distance);
  const { itemCost, breakdown } = calculateItemCost(params.items);

  return {
    distance,
    basePrice,
    itemCost,
    totalPrice: basePrice + itemCost,
    breakdown: {
      pricingTier,
      pickupZip: params.pickup_zip,
      dropoffZip: params.dropoff_zip,
      items: breakdown,
    },
  };
}

export { ITEM_PRICES };