const bcrypt = require("bcryptjs");
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
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!mongodbUri || !adminUsername || !adminPassword) {
  throw new Error(
    "Missing MONGODB_URI, ADMIN_USERNAME, or ADMIN_PASSWORD environment variables."
  );
}

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

async function seedAdmin() {
  await mongoose.connect(mongodbUri, { bufferCommands: false });

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await Admin.findOneAndUpdate(
    { username: adminUsername },
    { username: adminUsername, passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await mongoose.disconnect();
  console.log("Admin user seeded successfully.");
}

seedAdmin().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});