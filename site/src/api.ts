// 同源 Function 请求封装：/functions/v1/app?action=...
// 会话令牌存放在 localStorage，并以自定义请求头发送（平台会剥离 cookie，无法用 Cookie 会话）。
export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<string, string> = {
  login_required: '登录已过期，请重新登录。',
  invalid_credentials: '账号或密码不正确。',
  account_disabled: '该账号已被停用，请联系管理员。',
  account_locked: '密码错误次数过多，请稍后再试。',
  password_change_required: '请先修改初始密码后继续使用。',
  wrong_password: '当前密码不正确。',
  same_password: '新密码不能与当前密码相同。',
  weak_password: '密码需 8-64 位，且同时包含字母和数字。',
  password_equals_account: '密码不能包含账号名。',
  invalid_username: '账号格式不正确：2-32 位字母、数字或 . _ -。',
  username_taken: '该账号名已被使用。',
  invalid_role: '角色选择不正确。',
  already_initialized: '系统已完成初始化，无法再次创建管理员。',
  cannot_delete_self: '不能删除自己当前使用的账号。',
  cannot_disable_self: '不能停用自己当前使用的账号。',
  cannot_demote_self: '不能把自己当前使用的管理员账号降级。',
  student_required: '学生账号需要关联一名学生。',
  student_not_allowed: '教师与管理员账号不关联学生。',
  assignments_not_allowed: '只有教师账号需要勾选任教科目与班级。',
  invalid_assignment: '任教勾选无效，请重新选择科目与班级。',
  out_of_scope: '该科目或班级不在你的任教范围内。',
  not_a_student: '该视图仅对学生账号开放。',
  access_denied: '没有访问权限，请联系管理员确认账号角色。',
  forbidden: '当前账号没有该操作权限。',
  invalid_user_context: '登录状态异常，请重新登录。',
  not_found: '请求的资源或操作不存在。',
  already_seeded: '系统中已有学生数据，不能重复导入演示数据。',
  class_not_empty: '该班级下还有学生，请先转出学生。',
  class_not_found: '班级名称不存在，请先在「系统设置」中创建该班级。',
  student_not_found: '学号未找到对应的学生（或不在你的任教班级内）。',
  subject_not_found: '科目名称不存在，请与「成绩录入」中的科目名保持一致。',
  duplicate_row: '同一份文件里学号重复，请保留一行。',
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

const TOKEN_KEY = 'school-app-token';

function readStoredToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

let appToken = readStoredToken();

export function setAppToken(token: string) {
  appToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* 隐私模式下仅本次会话有效 */ }
}

export const getAppToken = () => appToken;

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => { onUnauthorized = handler; };

export async function requestJson<T = Record<string, unknown>>(
  url: string, init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (appToken) headers.set('X-App-Token', appToken);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  } catch (error) {
    if ((init.signal as AbortSignal | undefined)?.aborted) throw error;
    throw new ApiError(MESSAGES.network_error, 'network_error');
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (response.redirected) throw new ApiError(MESSAGES.invalid_response, 'invalid_response', response.status);
  let data: unknown = null;
  if (isJson) { try { data = await response.json(); } catch { data = null; } }
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const code = typeof body?.error === 'string' ? body.error
    : (!response.ok || body?.ok === false) && typeof body?.code === 'string' ? body.code
    : !response.ok && (response.status === 401 || response.status === 403) ? 'access_denied'
    : response.ok ? null : 'request_failed';
  if (!isJson && !response.ok) throw new ApiError(MESSAGES.invalid_response, 'invalid_response', response.status);
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? 'request_failed';
    if (resolved === 'login_required') { setAppToken(''); onUnauthorized?.(); }
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

// 导入预览要按服务端返回的逐行错误码本地化，错误码与文案统一维护在这里
export const errorText = (code: string): string => MESSAGES[code] ?? MESSAGES.request_failed;

// 分数以十分之一分为单位存储（112.5 -> 1125）
export const fmtScore = (tenths: number | null | undefined): string =>
  tenths === null || tenths === undefined ? '—' : String(tenths / 10);
