import { prisma } from "../../config/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";

export async function authenticate(req, res, next) {
  const authorization = req.get("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Bearer access token is required" });
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: "Access token is invalid or expired" });
  }

  const userId = Number(claims.sub);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({ error: "Access token is invalid" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user?.isActive) {
    return res.status(401).json({ error: "User account is inactive or no longer exists" });
  }

  req.auth = { userId };
  return next();
}