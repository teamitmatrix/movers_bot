const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

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