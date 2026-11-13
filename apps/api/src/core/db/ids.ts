import { ObjectId } from 'mongodb';
import { AppError } from '../errors/app-error';

export function parseObjectId(id: string): ObjectId {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new AppError('NOT_FOUND');
  }
  return new ObjectId(id);
}
