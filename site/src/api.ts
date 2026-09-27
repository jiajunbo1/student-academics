// 同源 Function 请求封装：/functions/v1/app?action=...
export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<string, string> = {
  login_required: '请先登录 Qoder 账号后再访问本系统。',
  access_denied: '没有访问权限，请确认已加入本站点。',
  invalid_user_context: '登录状态异常，请重新登录。',
  forbidden: '需要管理员权限才能执行此操作。',
  not_found: '请求的资源或操作不存在。',
  already_seeded: '系统中已有学生数据，不能重复导入演示数据。',
  class_not_empty: '该班级下还有学生，请先转出学生。',
  invalid_score: '分数需为 0-150 之间的数字。',
  invalid_date: '日期格式不正确。',
  invalid_id: '选择了无效的记录，请刷新后重试。',
  invalid_choice: '填写的选项不在允许范围内。',
  invalid_text: '有必填内容未填写或格式不正确。',
  missing_field: '有必填内容未填写。',
  missing_date: '请填写日期。',
  text_too_long: '内容过长，请精简。',
  invalid_number: '请填写有效的整数。',
  invalid_list: '提交的内容过多。',
  invalid_body: '提交的数据格式不正确。',
  db_error: '数据读写失败，请稍后重试。',
  count_unavailable: '暂时无法统计数据量。',
  server_error: '服务暂时不可用，请稍后重试。',
  network_error: '网络请求失败，请先确认当前操作是否已生效，再决定是否重试。',
  invalid_response: '服务返回了异常内容，请检查登录状态。',
  request_failed: '操作失败，请重试。',
  write_rejected: '数据写入被拒绝，请检查填写内容。',
};

export async function requestJson<T = Record<string, unknown>>(
  url: string, init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  } catch (error) {
    if ((init.signal as AbortSignal | undefined)?.aborted) throw error;
    throw new ApiError(MESSAGES.network_error, 'network_error');
  }
  if (response.status === 401 || response.status === 403) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    const code = body?.error === 'forbidden' ? 'forbidden' : 'access_denied';
    throw new ApiError(MESSAGES[code], code, response.status);
  }
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(MESSAGES.invalid_response, 'invalid_response', response.status);
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ApiError(MESSAGES.invalid_response, 'invalid_response', response.status); }
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const code = typeof body?.error === 'string' ? body.error
    : (!response.ok || body?.ok === false) && typeof body?.code === 'string' ? body.code
    : response.ok ? null : 'request_failed';
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? 'request_failed';
    throw new ApiError(MESSAGES[resolved] ?? MESSAGES.request_failed, resolved, response.status);
  }
  return data as T;
}

export const apiGet = <T = Record<string, unknown>>(action: string, params?: Record<string, string | undefined>) => {
  const qs = new URLSearchParams({ action });
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  return requestJson<T>(`/functions/v1/app?${qs.toString()}`);
};

export const apiPost = <T = Record<string, unknown>>(action: string, body: unknown) =>
  requestJson<T>(`/functions/v1/app?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return MESSAGES.request_failed;
}

// 分数以十分之一分为单位存储（112.5 -> 1125）
export const fmtScore = (tenths: number | null | undefined): string =>
  tenths === null || tenths === undefined ? '—' : String(tenths / 10);
