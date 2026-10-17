import {
  getTenantsOverview,
  updateTenantStatus,
  verifyMfaAndIssueToken,
  executeBreakGlassRecovery,
  getPlatformAuditLogs,
} from "../services/platform.service.js";

export async function getTenantsOverviewHandler(req, res, next) {
  try {
    const data = await getTenantsOverview();
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function updateTenantStatusHandler(req, res, next) {
  try {
    const tenantId = Number(req.params.id);
    if (!Number.isSafeInteger(tenantId) || tenantId < 1) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { isSuspended, reason } = req.body;
    if (typeof isSuspended !== "boolean") {
      return res.status(400).json({ error: "isSuspended must be a boolean" });
    }

    const result = await updateTenantStatus(
      tenantId,
      { isSuspended, reason },
      req.auth.userId,
      req.ip
    );

    return res.status(200).json({
      message: `Tenant ${isSuspended ? "suspended" : "activated"} successfully`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyMfaStepUpHandler(req, res, next) {
  try {
    const { totpCode, targetOrganizationId } = req.body || {};
    const result = await verifyMfaAndIssueToken({
      operatorId: req.auth.userId,
      targetOrganizationId,
      totpCode,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

export async function executeBreakGlassHandler(req, res, next) {
  try {
    const {
      targetOrganizationId,
      designatedMemberId,
      ticketId,
      justification,
    } = req.body || {};

    const nonce = req.mfaSession?.nonce;

    const result = await executeBreakGlassRecovery({
      operatorId: req.auth.userId,
      targetOrganizationId,
      designatedMemberId,
      ticketId,
      justification,
      ipAddress: req.ip,
      nonce,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
}

export async function getPlatformAuditLogsHandler(req, res, next) {
  try {
    const data = await getPlatformAuditLogs();
    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}
