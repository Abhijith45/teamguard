import {
  getVelocityReportData,
  getAuditComplianceReportData,
  getReportsSummaryService,
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

    // Record immutable audit event for compliance report export (US-REP-001 AC 3)
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

    // Record immutable audit event for compliance report export (US-REP-001 AC 3)
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

    const summary = await getReportsSummaryService({ organizationId });
    return res.status(200).json({ summary });
  } catch (error) {
    next(error);
  }
}
