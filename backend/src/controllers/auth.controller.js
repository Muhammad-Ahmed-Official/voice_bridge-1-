import { User } from "../models/user.models.js";
import { cloneVoiceFromAudio } from "../services/voiceCloning.js";
import { sendEmailOTP } from "../email/sendEmail.js";

export const signUp = async (req, res) => {
  try {
    const { userId, email, password } = req.body;
    if ([userId, email, password].some((field) => typeof field !== "string" || field.trim() === "")) {
      return res
      .status(400)
      .send({ status: false, message: "Missing Fields" });
    }

    const isUserExist = await User.findOne({
      $or: [{ userId: userId }, { email: email }],
    });
    if (isUserExist) {
      return res
        .status(409)
        .send({ status: false, message: "User already exists" });
    }

    // Create the user and save in DB
    await User.create({
      userId,
      email,
      password,
    });
    res
      .status(201)
      .send({ status: true, message: "User created successfully" });
  } catch (error) {
    return res
      .status(500)
      .send({ status: false, message: error.message });
  }
};

export const signIn = async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (
      [userId, password].some(
        (field) => typeof field !== "string" || field.trim() === "",
      )
    ) {
      return res
        .status(400)
        .send({ status: false, message: "Missing Fields" });
    }

    const user = await User.findOne({ userId });

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "Invalid Credentials" });
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ status: false, message: "Incorrect password" });
    }

    const userResponse = {
      _id: user._id,
      userId: user.userId,
      name: user.userId,
      voiceCloningEnabled: !!user.voiceCloningEnabled,
    };
    return res.status(200).json({
      status: true,
      message: "Login successful",
      user: userResponse,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, message: error.message });
  }
};

// Search user by userId string (for starting a new chat bridge)
export const searchUser = async (req, res) => {
  try {
    const { userId } = req.query;
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ status: false, message: 'userId query param is required' });
    }
    const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }
    return res.status(200).json({
      status: true,
      user: { _id: user._id, userId: user.userId },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Simple preferences endpoint: update global voice cloning flag
export const updatePreferences = async (req, res) => {
  try {
    const { userId, voiceCloningEnabled } = req.body;

    if (typeof userId !== "string" || !userId.trim()) {
      return res
        .status(400)
        .json({ status: false, message: "userId is required" });
    }

    const update = {};
    if (typeof voiceCloningEnabled === "boolean") {
      update.voiceCloningEnabled = voiceCloningEnabled;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No valid fields to update",
      });
    }

    const user = await User.findOneAndUpdate(
      { userId },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found" });
    }

    const userResponse = {
      _id: user._id,
      userId: user.userId,
      name: user.userId,
      voiceCloningEnabled: !!user.voiceCloningEnabled,
    };

    return res.status(200).json({
      status: true,
      message: "Preferences updated",
      user: userResponse,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: false, message: error.message });
  }
};

export const voiceSetup = async (req, res) => {
  try {
    const { userId, audioBase64, mimeType } = req.body;

    if (!userId?.trim() || !audioBase64) {
      return res.status(400).json({ status: false, message: 'userId and audioBase64 are required' });
    }

    const voiceId = await cloneVoiceFromAudio(userId.trim(), audioBase64, mimeType || 'audio/m4a');
    return res.json({ status: true, message: 'Voice clone created successfully', voiceId });

  } catch (err) {
    if (err.message === 'VOICE_LIMIT_REACHED') {
      return res.status(429).json({ status: false, message: 'ElevenLabs voice limit reached. Please try later.' });
    }
    if (err.message.includes('too small')) {
      return res.status(400).json({ status: false, message: err.message });
    }
    console.error('[VoiceSetup]', err.message);
    return res.status(500).json({ status: false, message: 'Voice cloning failed. Please try again.' });
  }
};



export const forgotPassword = async (req, res) => {
   try {
    const { email } = req.body;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ status: false, message: "email is required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailResponse = await sendEmailOTP(normalizedEmail, otp);
    if (!emailResponse) {
      return res.status(500).json({ status: false, message: "Failed to send email" });
    }
    user.otp = otp;
    await user.save({ validateBeforeSave: false });
    return res.status(200).json({ status: true, message: "OTP sent to email" });
   } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
   }
};


export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (typeof email !== "string" || !email.trim() || typeof otp !== "string" || !otp.trim() || typeof newPassword !== "string" || !newPassword.trim()) {
      return res.status(400).json({ status: false, message: "email, otp and newPassword are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();
    const normalizedNewPassword = newPassword.trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    if (!user.otp || user.otp !== normalizedOtp) {
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }

    user.password = normalizedNewPassword;
    user.otp = undefined;
    await user.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json({ status: true, message: "Password reset successfully" });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};


export const changePassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (typeof userId !== "string" || !userId.trim() || typeof newPassword !== "string" || !newPassword.trim()) {
      return res.status(400).json({ status: false, message: "userId and newPassword are required" });
    }
    const trimmedUserId = userId.trim();
    const trimmedNewPassword = newPassword.trim();
    if (trimmedNewPassword.length < 6) {
      return res.status(400).json({ status: false, message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(trimmedNewPassword, 10);
    const updated = await User.findOneAndUpdate(
      { userId: trimmedUserId },
      { $set: { password: hashedPassword } },
      { new: false },
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    return res.status(200).json({ status: true, message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};