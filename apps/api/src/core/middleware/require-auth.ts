import type { RequestHandler } from 'express';
import type { ObjectId } from 'mongodb';
import type { AppDeps } from '../deps';
import { AppError } from '../errors/app-error';
import { parseObjectId } from '../db/ids';
import { verifyAccessToken } from '../../modules/auth/tokens';

export function requireAuth(deps: AppDeps): RequestHandler {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization;
      const m = header ? /^Bearer (\S+)$/i.exec(header) : null;
      if (!m) throw new AppError('UNAUTHENTICATED');
      const { userId } = await verifyAccessToken(
        m[1] as string,
        deps.config.jwtSecret,
        deps.now(),
      );
      let id: ObjectId;
      try {
        id = parseObjectId(userId);
      } catch {
        throw new AppError('UNAUTHENTICATED');
      }
      const db = await deps.getDb();
      const exists = await db
        .collection('users')
        .countDocuments({ _id: id }, { limit: 1 });
      if (!exists) throw new AppError('UNAUTHENTICATED');
      res.locals.userId = id;
      next();
    } catch (e) {
      next(e);
    }
  };
}
