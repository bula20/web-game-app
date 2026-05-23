import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFriendRequest extends Document {
  from: Types.ObjectId;
  to: Types.ObjectId;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
}

const friendRequestSchema = new Schema<IFriendRequest>(
  {
    from: { type: Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);

friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });
friendRequestSchema.index({ to: 1, status: 1 });

export const FriendRequest = mongoose.model<IFriendRequest>(
  "FriendRequest",
  friendRequestSchema,
);
