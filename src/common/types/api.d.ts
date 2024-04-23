import type { CodeResult } from './enum'

interface ApiResponse<T> {
  code: CodeResult
  message: string
  data: T
}
