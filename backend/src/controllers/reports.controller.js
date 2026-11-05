import { cache } from "../lib/cache.js";
import {
  getVelocityReportData,
  getAuditComplianceReportData,
  getReportsSummaryService,
  getCompletionTrendService,
  getWorkloadReportService,
  getMemberActivityService,
  getStorageReportService,
  getOverdueTasksService,
} from "../services/reports.service.js";
import { logAuditEvent } from "../services/audit.service.js";

/**
 * Streams organization task velocity and completion rate data as CSV (TASK-507 / DP-REP-001).
 */
export async function exportTasksVelocityCsv(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }

    const { projectId, from, to } = req.query;

    const result = await getVelocityReportData({
      organizationId,
      projectId,
      from,
      to,
    });

    await logAuditEvent({
      organizationId,
      actorId: req.auth.userId,
      action: "report:export",
      resourceType: "Report",
      resourceId: "tasks_velocity",
      details: {
        reportType: "tasks_velocity",
        format: "csv",
        recordCount: result.count,
        filterProjectId: projectId || null,
      },
      outcome: "SUCCESS",
    });

    const filename = `teamguard-velocity-${organizationId}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(result.csv);
  } catch (error) {
    next(error);
  }
}

/**
 * Streams organization security and audit history as CSV (TASK-507 / DP-REP-001).
 */
export async function exportAuditComplianceCsv(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }

    const { action, resourceType, outcome, from, to } = req.query;

    const result = await getAuditComplianceReportData({
      organizationId,
      action,
      resourceType,
      outcome,
      from,
      to,
    });

    await logAuditEvent({
      organizationId,
      actorId: req.auth.userId,
      action: "report:export",
      resourceType: "Report",
      resourceId: "audit_compliance",
      details: {
        reportType: "audit_compliance",
        format: "csv",
        recordCount: result.count,
      },
      outcome: "SUCCESS",
    });

    const filename = `teamguard-compliance-audit-${organizationId}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(result.csv);
  } catch (error) {
    next(error);
  }
}

/**
 * Returns aggregated workspace reporting overview metrics in JSON.
 */
export async function getReportsSummary(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const summary = await cache.getOrSet(
      `reports:summary:${organizationId}`,
      () => getReportsSummaryService({ organizationId }),
      { ttlMs: 30 * 1000, tags: [`tenant:${organizationId}`, `reports:${organizationId}`] }
    );
    return res.status(200).json({ summary });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns daily completion trend data for the past N days.
 */
export async function getCompletionTrend(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const { days } = req.query;
    const trend = await cache.getOrSet(
      `reports:trend:${organizationId}:${days || 30}`,
      () => getCompletionTrendService({ organizationId, days }),
      { ttlMs: 30 * 1000, tags: [`tenant:${organizationId}`, `reports:${organizationId}`] }
    );
    return res.status(200).json({ trend });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns workload distribution grouped by assignee.
 */
export async function getWorkloadReport(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const data = await cache.getOrSet(
      `reports:workload:${organizationId}`,
      () => getWorkloadReportService({ organizationId }),
      { ttlMs: 30 * 1000, tags: [`tenant:${organizationId}`, `reports:${organizationId}`] }
    );
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * Returns per-member activity stats.
 */
export async function getMemberActivity(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const { from, to } = req.query;
    const data = await getMemberActivityService({ organizationId, from, to });
    return res.status(200).json({ members: data });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns file/storage breakdown by project.
 */
export async function getStorageReport(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const data = await getStorageReportService({ organizationId });
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * Returns top overdue tasks.
 */
export async function getOverdueTasks(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: "Missing x-organization-id tenant context" });
    }
    const { limit } = req.query;
    const tasks = await getOverdueTasksService({ organizationId, limit });
    return res.status(200).json({ tasks });
  } catch (error) {
    next(error);
  }
}
