import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { createToken, requireAuth } from "../auth.js";
import { User, logActivity } from "../models.js";
import { userPayload } from "../serialize.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { full_name, email, password, role = "patient" } = req.body || {};
  if (!full_name || full_name.length < 2) return res.status(422).json({ detail: "Full name is required." });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(422).json({ detail: "A valid email is required." });
  if (!password || password.length < 6) return res.status(422).json({ detail: "Password must be at least 6 characters." });
  if (!["patient", "doctor"].includes(role)) return res.status(422).json({ detail: "Role must be patient or doctor." });

  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ detail: "An account with this email already exists." });

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    fullName: full_name,
    role,
    isVerified: role !== "doctor",
    patientId: role === "patient" ? `PT-${crypto.randomBytes(3).toString("hex").toUpperCase()}` : undefined,
    anonId: role === "patient" ? `ANON-${crypto.randomBytes(4).toString("hex")}` : undefined,
  });
  await logActivity(user, "register", `role=${role}`);

  res.json({
    token: createToken(user),
    user: userPayload(user),
    message:
      role === "doctor"
        ? "Doctor account created - an administrator must verify it before you can access patient records."
        : "Account created.",
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || "").toLowerCase() });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
    return res.status(401).json({ detail: "Invalid email or password." });
  if (user.isBlocked)
    return res.status(403).json({ detail: "This account has been blocked by an administrator." });

  await logActivity(user, "login");
  res.json({ token: createToken(user), user: userPayload(user) });
});

router.post("/logout", requireAuth, async (req, res) => {
  await logActivity(req.user, "logout");
  res.json({ message: "Logged out." });
});

router.get("/me", requireAuth, (req, res) => res.json(userPayload(req.user)));

export default router;
