import { z } from "zod";
import {
  createProjectService,
  getProjectService,
  listProjectsService,
  restoreProjectService,
  softDeleteProjectService,
  updateProjectService,
} from "../services/projects.service.js";

const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional().default(""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  status: z.enum(["ACTIVE", "PLANNING", "COMPLETED", "ARCHIVED"]).default("ACTIVE"),
  teamMembers: z.array(z.object({
    email: z.string().email(),
    role: z.string().optional(),
    department: z.string().optional(),
    personalMessage: z.string().optional(),
  })).optional().default([]),
  initialTasks: z.array(z.object({
    title: z.string().min(1),
    status: z.enum(["TODO", "IN_PROGRESS", "REVISION", "DONE"]).default("TODO"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  })).optional().default([]),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["ACTIVE", "PLANNING", "COMPLETED", "ARCHIVED"]).optional(),
});

export async function listProjects(req, res, next) {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const projects = await listProjectsService({
      organizationId: req.organizationId,
      includeDeleted,
    });

    return res.json({ projects });
  } catch (error) {
    next(error);
  }
}

export async function getProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID: must be a positive integer" });
    }

    const includeDeleted = req.query.includeDeleted === "true";
    const project = await getProjectService({
      projectId,
      organizationId: req.organizationId,
      includeDeleted,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    return res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function createProject(req, res, next) {
  try {
    const input = createProjectSchema.parse(req.body);
    const orgId = req.organizationId;
    const actorId = req.auth.userId;

    const project = await createProjectService({
      organizationId: orgId,
      actorId,
      input,
    });

    return res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
}

export async function updateProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID: must be a positive integer" });
    }

    const input = updateProjectSchema.parse(req.body);
    const updated = await updateProjectService({
      projectId,
      organizationId: req.organizationId,
      actorId: req.auth.userId,
      input,
    });

    if (!updated) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    return res.json({ project: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID: must be a positive integer" });
    }

    const deleted = await softDeleteProjectService({
      projectId,
      organizationId: req.organizationId,
      actorId: req.auth.userId,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Project not found in this organization" });
    }

    return res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function restoreProject(req, res, next) {
  try {
    const projectId = Number(req.params.projectId);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: "Invalid project ID: must be a positive integer" });
    }

    const restored = await restoreProjectService({
      projectId,
      organizationId: req.organizationId,
      actorId: req.auth.userId,
    });

    if (!restored) {
      return res.status(404).json({ error: "Soft-deleted project not found in this organization" });
    }

    return res.json({ project: restored });
  } catch (error) {
    next(error);
  }
}
