import mongoose from 'mongoose';

const CONNECTION_ERROR_CODES = new Set([
  6, 7, 89, 91, 189, 11600, 11602,
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH',
]);
const CONNECTION_ERROR_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
  'MongoServerSelectionError',
  'MongoTimeoutError',
  'MongooseServerSelectionError',
]);

export const isMongoUnavailable = (error) =>
  mongoose.connection.readyState !== 1 ||
  CONNECTION_ERROR_NAMES.has(error?.name) ||
  CONNECTION_ERROR_CODES.has(error?.code);
