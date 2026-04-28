/**
 * Recruitment routes — /api/v1/recruitment
 */

const express = require("express");
const multer = require("multer");
const { upload } = require("../../config/cloudinary");
const { authenticateToken, authorizeRole } = require("../middleware/auth");
const controller = require("../controllers/recruitment.controller");

const router = express.Router();

/**
 * Accept files via multipart:
 * - Photo: `photo` (canonical), or `profile_photo` / `picture` (aliases) — JPEG, PNG, WebP
 * - CV: `cv` (canonical), or `file` / `resume` (aliases) — PDF
 * - Cover letter: `cover_letter` (canonical), or `motivation_letter` / `letter` (aliases) — PDF
 */
function cvUploadMiddleware(req, res, next) {
  if (!upload) {
    return res.status(503).json({
      success: false,
      error: "File upload is not configured (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).",
    });
  }
  const parser = upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "profile_photo", maxCount: 1 },
    { name: "picture", maxCount: 1 },
    { name: "cv", maxCount: 1 },
    { name: "file", maxCount: 1 },
    { name: "resume", maxCount: 1 },
    { name: "cover_letter", maxCount: 1 },
    { name: "motivation_letter", maxCount: 1 },
    { name: "letter", maxCount: 1 },
  ]);
  return parser(req, res, (err) => {
    if (!err) {
      const files = req.files;
      if (files && typeof files === "object") {
        const one =
          (files.cv && files.cv[0]) ||
          (files.file && files.file[0]) ||
          (files.resume && files.resume[0]);
        if (one) req.file = one;
      }
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: "Each file must be at most 10MB",
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
    if (
      err.statusCode === 400 ||
      (err.message &&
        (/PDF/i.test(err.message) ||
          /photo|image|JPEG|PNG|WebP/i.test(err.message)))
    ) {
      return res.status(400).json({
        success: false,
        error: err.message || "Invalid file",
      });
    }
    return next(err);
  });
}

// --- Public ---
router.get("/jobs", controller.listOpenJobs);
router.get("/jobs/:id/questions", controller.getJobQuestionsPublic);
router.get("/jobs/:id", controller.getOpenJobPublic);
router.post("/apply", cvUploadMiddleware, controller.apply);

// --- Admin ---
const admin = express.Router();
admin.use(authenticateToken);
admin.use(authorizeRole(["agency", "super_admin"]));

admin.get("/jobs", controller.listAdminJobs);
admin.post("/jobs", controller.createAdminJob);
admin.patch("/jobs/:id", controller.patchAdminJob);
admin.delete("/jobs/:id", controller.deleteAdminJob);

admin.get("/jobs/:id/questions", controller.listAdminJobQuestions);
admin.post("/jobs/:id/questions", controller.createAdminJobQuestion);
admin.patch("/questions/:questionId", controller.patchAdminQuestion);
admin.delete("/questions/:questionId", controller.deleteAdminQuestion);

admin.get("/applications", controller.listAdminApplications);
admin.get("/applications/:id", controller.getAdminApplication);
admin.get("/applications/:id/cv", controller.getAdminApplicationCv);
admin.get("/applications/:id/cover-letter", controller.getAdminApplicationCoverLetter);
admin.patch("/applications/:id", controller.patchAdminApplication);

router.use("/admin", admin);

module.exports = router;
