import type { ErrorCode, Result, SerializedError } from '../shared/types'
import { t } from './i18n'

/** 业务错误：带错误码，便于渲染进程区分处理 */
export class ServiceError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ServiceError'
    this.code = code
  }
}

export function notFound(message: string): ServiceError {
  return new ServiceError('NOT_FOUND', message)
}

export function alreadyExists(message: string): ServiceError {
  return new ServiceError('EXISTS', message)
}

export function invalidArgument(message: string): ServiceError {
  return new ServiceError('INVALID_ARGUMENT', message)
}

interface NodeError {
  code?: string
  message?: string
}

/** 把 Node 的 fs 错误映射成业务错误码 */
export function fromFsError(error: unknown, target: string): ServiceError {
  if (error instanceof ServiceError) return error

  const nodeError = error as NodeError
  const reason = nodeError?.message ?? String(error)

  switch (nodeError?.code) {
    case 'ENOENT':
      return new ServiceError('NOT_FOUND', t('svc.fsNotFound', { value: target }), { cause: error })
    case 'EEXIST':
    case 'ENOTEMPTY':
      return new ServiceError('EXISTS', t('svc.fsExists', { value: target }), { cause: error })
    case 'EACCES':
    case 'EPERM':
      return new ServiceError('PERMISSION_DENIED', t('svc.fsPermission', { value: target }), { cause: error })
    case 'EINVAL':
    case 'ENAMETOOLONG':
      return new ServiceError('INVALID_PATH', t('svc.fsInvalidPath', { value: target }), { cause: error })
    default:
      return new ServiceError('IO_ERROR', t('svc.fsIoError', { value: target, reason }), { cause: error })
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof ServiceError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN', message: error.message }
  }
  return { code: 'UNKNOWN', message: String(error) }
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail(error: unknown): Result<never> {
  return { ok: false, error: serializeError(error) }
}
