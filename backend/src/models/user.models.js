import mongoose from 'mongoose';
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
    },
    voiceCloningEnabled: {
      type: Boolean,
      default: false,
    },
    voiceId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);


userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});


userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);