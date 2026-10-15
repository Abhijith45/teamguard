import { Router } from "express";
import { switchPersona } from "../controllers/demo.controller.js";

const router = Router();

router.post("/switch-persona", switchPersona);

export default router;
