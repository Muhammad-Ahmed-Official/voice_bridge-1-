import { Router } from "express";
import { signIn, signUp, updatePreferences, searchUser, voiceSetup } from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.route("/signup").post(signUp);
authRouter.route("/signin").post(signIn);

// Update simple user preferences (e.g. ElevenLabs voice cloning toggle)
authRouter.route("/preferences").patch(updatePreferences);

// Onboarding voice clone — upload audio sample to create ElevenLabs voice
authRouter.route("/voice-setup").post(voiceSetup);

// Search user by userId string (used to start a new Bridge Messenger conversation)
authRouter.route("/users/search").get(searchUser);

export default authRouter;