import type { CodeResult } from './enum'

interface ApiResponse<T = unknown> {
  code: CodeResult
  message: string
  data?: T
}
