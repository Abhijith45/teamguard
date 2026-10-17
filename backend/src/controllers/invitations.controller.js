import { z } from "zod";
import {
  createInvitationService,
  listInvitationsService,
  acceptInvitationService,
  revokeInvitationService,
  resendInvitationService,
  verifyInvitationService,
} from "../services/invitations.service.js";

const createInvitationSchema = z.object({
  email: z.string().trim().email("Invalid email address format").max(255),
  roleId: z.number().int().positive("A valid role ID is required"),
  department: z.string().trim().max(100).optional().nullable(),
});

const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1, "Invitation token is required"),
});

function parseId(param) {
  const id = Number(param);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function createInvitation(req, res, next) {
  try {
    const parseResult = createInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, roleId, department } = parseResult.data;

    const inviterId = req.user?.id || req.auth?.userId;

    const result = await createInvitationService({
      organizationId: req.organizationId,
      inviterId,
      email,
      roleId,
      department,
      callerPermissions: req.userPermissions,
      frontendUrl: req.headers.origin,
    });

    return res.status(201).json({
      message: "Invitation dispatched successfully",
      ...result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
        unauthorizedPermissions: error.unauthorizedPermissions,
      });
    }
    next(error);
  }
}

export async function listInvitations(req, res, next) {
  try {
    const { status } = req.query;
    const invitations = await listInvitationsService({
      organizationId: req.organizationId,
      status: status ? String(status).toUpperCase() : undefined,
    });

    return res.status(200).json({ invitations });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitation(req, res, next) {
  try {
    const parseResult = acceptInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { token } = parseResult.data;
    const userId = req.user?.id || req.auth?.userId;
    const userEmail = req.user?.email;

    const result = await acceptInvitationService({
      rawToken: token,
      userId,
      userEmail,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}

export async function revokeInvitation(req, res, next) {
  try {
    const invitationId = parseId(req.params.id);
    if (!invitationId) {
      return res.status(400).json({ error: "Invalid invitation ID" });
    }

    const actorId = req.user?.id || req.auth?.userId;

    const result = await revokeInvitationService({
      organizationId: req.organizationId,
      invitationId,
      actorId,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
      });
    }
    next(error);
  }
}

export async function resendInvitation(req, res, next) {
  try {
    const invitationId = parseId(req.params.id);
    if (!invitationId) {
      return res.status(400).json({ error: "Invalid invitation ID" });
    }

    const actorId = req.user?.id || req.auth?.userId;

    const result = await resendInvitationService({
      organizationId: req.organizationId,
      invitationId,
      actorId,
      callerPermissions: req.userPermissions,
      frontendUrl: req.headers.origin,
    });

    return res.status(200).json({
      message: "Invitation resent successfully",
      ...result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
        unauthorizedPermissions: error.unauthorizedPermissions,
      });
    }
    next(error);
  }
}

export async function verifyInvitation(req, res, next) {
  try {
    const { token } = req.query;
    const result = await verifyInvitationService({ rawToken: token });
    return res.status(200).json({ invitation: result });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: error.message,
      });
    }
    next(error);
  }
}
