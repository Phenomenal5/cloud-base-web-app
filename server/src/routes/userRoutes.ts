import { Router } from "express";
import {
  updateProfile,
  uploadUserAvatar,
  deleteUserAvatar,
} from "../controllers/userController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { uploadAvatar } from "../middlewares/upload.js";
import { updateProfileSchema } from "../validators/userSchemas.js";

// Profile self-service. The avatar images themselves are served statically from
// /uploads/avatars (see app.ts), not from here.

const router = Router();

router.patch("/me", protect, validate(updateProfileSchema), updateProfile);
router.put("/me/avatar", protect, uploadAvatar, uploadUserAvatar);
router.delete("/me/avatar", protect, deleteUserAvatar);

export default router;
