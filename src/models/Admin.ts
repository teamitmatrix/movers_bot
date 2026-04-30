import { Model, Schema, model, models } from "mongoose";

export interface AdminDocument {
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<AdminDocument>(
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

const Admin = (models.Admin as Model<AdminDocument>) || model<AdminDocument>("Admin", adminSchema);

export default Admin;