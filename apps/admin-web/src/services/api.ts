import axios, { AxiosError } from 'axios';
import {
  User,
  EmployeeProfile,
  AttendancePunch,
  EntrySubmission,
  SystemAlert,
  AuditLog,
  SubAdminEnriched,
  Role,
  SystemSettingsState,
  FloatReplenishmentRequest,
  BankAccount,
  EmployeeBankAccount,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Bearer Token when present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: 401 Token Expiration Handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !(originalRequest as any)._retry) {
      (originalRequest as any)._retry = true;
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_user');
    }
    return Promise.reject(error);
  }
);

// ==========================================
// PRODUCTION API SERVICE METHODS
// ==========================================

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', {
      identifier: email.trim(),
      email: email.trim(),
      password,
    });
    return res.data?.data || res.data;
  },
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('auth_user');
    }
  },
  getCurrentUser: async () => {
    try {
      const res = await apiClient.get('/auth/me');
      return res.data?.data || res.data;
    } catch (err) {
      const saved = localStorage.getItem('auth_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  },
  updatePassword: async (currentPassword: string, newPassword: string) => {
    const res = await apiClient.post('/auth/password', { currentPassword, newPassword });
    return res.data;
  },
};

export const superAdminApi = {
  getDashboard: async () => {
    const res = await apiClient.get('/super-admin/dashboard');
    return res.data?.data || res.data;
  },
  getUsers: async (params?: { role?: Role; status?: string; search?: string }) => {
    const res = await apiClient.get<{ users: User[] }>('/super-admin/users', { params });
    return res.data?.users || (Array.isArray(res.data) ? res.data : []);
  },
  createUser: async (userData: Partial<User> & { password?: string }) => {
    const res = await apiClient.post<{ user: User }>('/super-admin/users', userData);
    return res.data?.user || (res.data as any);
  },
  updateUser: async (userId: string, updates: Partial<User>) => {
    const res = await apiClient.patch<{ user: User }>(`/super-admin/users/${userId}`, updates);
    return res.data?.user || (res.data as any);
  },
  toggleUserStatus: async (userId: string, status: 'ACTIVE' | 'DEACTIVATED') => {
    const res = await apiClient.patch<{ user: User }>(`/super-admin/users/${userId}/status`, { status });
    return res.data?.user || (res.data as any);
  },
  changeUserPassword: async (userId: string, newPassword: string) => {
    const res = await apiClient.post(`/super-admin/users/${userId}/change-password`, { newPassword });
    return res.data;
  },
  getSubAdmins: async () => {
    const res = await apiClient.get<{ subAdmins: SubAdminEnriched[] }>('/super-admin/sub-admins');
    return res.data?.subAdmins || (Array.isArray(res.data) ? res.data : []);
  },
  assignEmployee: async (employeeId: string, subAdminId: string) => {
    const res = await apiClient.post('/super-admin/assignments', { employeeId, subAdminId });
    return res.data;
  },
  allocateFunds: async (data: { employeeId: string; amount: number; reference?: string; remarks?: string }) => {
    const res = await apiClient.post('/super-admin/allocations', data);
    return res.data;
  },
  getAllEmployees: async () => {
    const res = await apiClient.get<{ employees: EmployeeProfile[] }>('/super-admin/employees');
    return res.data?.employees || (Array.isArray(res.data) ? res.data : []);
  },
  createEmployee: async (data: any) => {
    const res = await apiClient.post<{ employee: EmployeeProfile }>('/super-admin/employees', data);
    return res.data?.employee || (res.data as any);
  },
  getAttendance: async (params?: { date?: string; employeeId?: string; discrepancyOnly?: boolean }) => {
    const res = await apiClient.get<{ attendance: AttendancePunch[] }>('/super-admin/attendance', { params });
    return res.data?.attendance || (Array.isArray(res.data) ? res.data : []);
  },
  getFinance: async (params?: { date?: string }) => {
    const res = await apiClient.get('/super-admin/finance', { params });
    return res.data?.data || res.data;
  },
  getAuditLogs: async (params?: { entityType?: string; actorRole?: string; search?: string }) => {
    const res = await apiClient.get<any>('/super-admin/audit-logs', { params });
    const raw = res.data;
    const logs: AuditLog[] =
      raw?.auditLogs ||
      raw?.data?.auditLogs ||
      raw?.data ||
      (Array.isArray(raw) ? raw : []);
    return logs;
  },
  getEmployeeDetail: async (id: string) => {
    try {
      const res = await apiClient.get(`/super-admin/employees/${id}`);
      return res.data?.data || res.data;
    } catch {
      const res = await apiClient.get(`/admin/employees/${id}`);
      return res.data?.data || res.data;
    }
  },
  getAlerts: async () => {
    const res = await apiClient.get<{ alerts: SystemAlert[] }>('/super-admin/alerts');
    return res.data?.alerts || (Array.isArray(res.data) ? res.data : []);
  },
  reviewAlert: async (alertId: string) => {
    const res = await apiClient.patch(`/super-admin/alerts/${alertId}/review`);
    return res.data?.alert || res.data;
  },
  getReports: async (type?: string) => {
    const res = await apiClient.get('/super-admin/reports', { params: { type } });
    return res.data?.data || res.data;
  },
  getSettings: async (): Promise<SystemSettingsState> => {
    const res = await apiClient.get('/super-admin/settings');
    return res.data?.data || res.data;
  },
  updateSettings: async (settings: SystemSettingsState): Promise<SystemSettingsState> => {
    const res = await apiClient.put('/super-admin/settings', settings);
    return res.data?.data || res.data;
  },
  getFloatRequests: async (status?: string) => {
    const res = await apiClient.get<{ requests: FloatReplenishmentRequest[] }>('/super-admin/finance/requests', { params: { status } });
    return res.data?.requests || (Array.isArray(res.data) ? res.data : []);
  },
  approveFloatRequest: async (id: string, data: { referenceId: string; bankAccount: string; screenshotUrl: string; remarks?: string }) => {
    const res = await apiClient.post(`/super-admin/finance/requests/${id}/approve`, data);
    return res.data;
  },
  rejectFloatRequest: async (id: string, reason: string) => {
    const res = await apiClient.post(`/super-admin/finance/requests/${id}/reject`, { reason });
    return res.data;
  },
};

export const subAdminApi = {
  getDashboard: async () => {
    const res = await apiClient.get('/admin/dashboard');
    return res.data?.data || res.data;
  },
  getFinanceOverview: async (params?: { date?: string }) => {
    const res = await apiClient.get('/admin/finance/overview', { params });
    return res.data?.data || res.data;
  },
  getEmployees: async () => {
    const res = await apiClient.get<{ employees: EmployeeProfile[] }>('/admin/employees');
    return res.data?.employees || (Array.isArray(res.data) ? res.data : []);
  },
  getEmployeeDetail: async (id: string) => {
    try {
      const res = await apiClient.get(`/admin/employees/${id}`);
      return res.data?.data || res.data;
    } catch {
      const res = await apiClient.get(`/super-admin/employees/${id}`);
      return res.data?.data || res.data;
    }
  },
  getAttendance: async (params?: { date?: string; employeeId?: string; discrepancyOnly?: boolean }) => {
    const res = await apiClient.get<{ attendance: AttendancePunch[] }>('/admin/attendance', { params });
    return res.data?.attendance || (Array.isArray(res.data) ? res.data : []);
  },
  getEntries: async (status?: string) => {
    const res = await apiClient.get<{ entries: EntrySubmission[] }>('/admin/entries', { params: { status } });
    return res.data?.entries || (Array.isArray(res.data) ? res.data : []);
  },
  approveEntry: async (id: string, remarks?: string) => {
    const res = await apiClient.post(`/admin/entries/${id}/approve`, { remarks });
    return res.data;
  },
  rejectEntry: async (id: string, reason: string, remarks?: string) => {
    const res = await apiClient.post(`/admin/entries/${id}/reject`, { reason, remarks });
    return res.data;
  },
  allocateFunds: async (data: { employeeId: string; amount: number; reference?: string; remarks?: string }) => {
    const res = await apiClient.post('/admin/allocations', data);
    return res.data;
  },
  getEmployeeFinance: async (employeeId: string, params?: { date?: string }) => {
    const res = await apiClient.get(`/admin/finance/${employeeId}`, { params });
    return res.data?.data || res.data;
  },
  getAlerts: async () => {
    const res = await apiClient.get<{ alerts: SystemAlert[] }>('/admin/alerts');
    return res.data?.alerts || (Array.isArray(res.data) ? res.data : []);
  },
  reviewAlert: async (id: string) => {
    const res = await apiClient.post(`/admin/alerts/${id}/review`);
    return res.data;
  },
  getEmployeeUpdates: async () => {
    const res = await apiClient.get('/admin/employee-updates');
    return res.data?.updates || (Array.isArray(res.data) ? res.data : []);
  },
  logUnmaskAudit: async (employeeId: string, employeeName: string) => {
    const res = await apiClient.post('/admin/audit/unmask-bank-details', { employeeId, employeeName });
    return res.data;
  },
  reviewEmployeeUpdate: async (id: string, status: 'APPROVED' | 'DISMISSED') => {
    const res = await apiClient.post(`/admin/employee-updates/${id}/review`, { status });
    return res.data;
  },
  getFloatRequests: async (status?: string) => {
    const res = await apiClient.get<{ requests: FloatReplenishmentRequest[] }>('/admin/finance/requests', { params: { status } });
    return res.data?.requests || (Array.isArray(res.data) ? res.data : []);
  },
  approveFloatRequest: async (id: string, data: { referenceId: string; bankAccount: string; screenshotUrl: string; remarks?: string }) => {
    const res = await apiClient.post(`/admin/finance/requests/${id}/approve`, data);
    return res.data;
  },
  rejectFloatRequest: async (id: string, reason: string) => {
    const res = await apiClient.post(`/admin/finance/requests/${id}/reject`, { reason });
    return res.data;
  },
};

export const employeeApi = {
  requestFloat: async (data: { amount: number; reason?: string; bankAccount?: string }) => {
    const res = await apiClient.post('/employee/finance/request', data);
    return res.data;
  },
  getFloatRequests: async () => {
    const res = await apiClient.get<{ requests: FloatReplenishmentRequest[] }>('/employee/finance/requests');
    return res.data?.requests || (Array.isArray(res.data) ? res.data : []);
  },
  getMyProfile: async () => {
    const res = await apiClient.get<EmployeeProfile>('/employee/profile');
    return (res.data as any)?.data || res.data;
  },
  getDashboard: async () => {
    const res = await apiClient.get('/employee/dashboard');
    return res.data?.data || res.data;
  },
  getAttendance: async () => {
    const res = await apiClient.get<{ attendance: AttendancePunch[] }>('/employee/attendance');
    return res.data?.attendance || (Array.isArray(res.data) ? res.data : []);
  },
  punchAttendance: async (punchType: 'CHECK_IN' | 'CHECK_OUT', notes?: string) => {
    const res = await apiClient.post('/employee/attendance/punch', { punchType, notes });
    return res.data;
  },
  getFinance: async () => {
    const res = await apiClient.get('/employee/finance');
    return res.data?.data || res.data;
  },
  getEntries: async () => {
    const res = await apiClient.get<{ entries: EntrySubmission[] }>('/employee/entries');
    return res.data?.entries || (Array.isArray(res.data) ? res.data : []);
  },
  submitEntry: async (data: {
    websiteUrl: string;
    amount: number;
    withdrawalAmount: number;
    referenceId: string;
    remarks?: string;
    screenshotUrl?: string;
  }) => {
    const res = await apiClient.post<EntrySubmission>('/employee/entries', data);
    return res.data;
  },
  updateProfile: async (data: {
    phone?: string;
    bankName?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
  }) => {
    const res = await apiClient.patch<EmployeeProfile>('/employee/profile', data);
    return res.data;
  },
  getBankAccounts: async () => {
    const res = await apiClient.get<{ bankAccounts: EmployeeBankAccount[] }>('/employee/bank-accounts');
    return res.data?.bankAccounts || [];
  },
  addBankAccount: async (data: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
    accountHolderName?: string;
    employeeAccount?: string;
    bankUsername?: string;
    bankPassword?: string;
    tags?: string[];
    isPrimary?: boolean;
  }) => {
    const res = await apiClient.post('/employee/bank-accounts', data);
    return res.data;
  },
  setPrimaryBankAccount: async (id: string) => {
    const res = await apiClient.patch(`/employee/bank-accounts/${id}/primary`);
    return res.data;
  },
  removeBankAccount: async (id: string) => {
    const res = await apiClient.delete(`/employee/bank-accounts/${id}`);
    return res.data;
  },
  addTagToAccount: async (id: string, tag: string) => {
    const res = await apiClient.post(`/employee/bank-accounts/${id}/tags`, { tag });
    return res.data;
  },
  removeTagFromAccount: async (id: string, tag: string) => {
    const res = await apiClient.delete(`/employee/bank-accounts/${id}/tags/${encodeURIComponent(tag)}`);
    return res.data;
  },
  updateTags: async (id: string, tags: string[]) => {
    const res = await apiClient.put(`/employee/bank-accounts/${id}/tags`, { tags });
    return res.data;
  },
  setUpiStatus: async (
    id: string,
    data: { isUpiActive: boolean; upiStatus?: 'ACTIVE' | 'EXHAUSTED' | 'INACTIVE'; reason?: string }
  ) => {
    const res = await apiClient.patch(`/employee/bank-accounts/${id}/upi-status`, data);
    return res.data;
  },
};

export const bankAccountApi = {
  getAll: async () => {
    const res = await apiClient.get<{ bankAccounts: BankAccount[] }>('/bank-accounts');
    return res.data?.bankAccounts || [];
  },
  getTags: async () => {
    const res = await apiClient.get<{ tags: string[] }>('/bank-accounts/tags');
    return res.data?.tags || [];
  },
  addTag: async (accountId: string, tag: string) => {
    const res = await apiClient.post(`/bank-accounts/${accountId}/tags`, { tag });
    return res.data;
  },
  removeTag: async (accountId: string, tag: string) => {
    const res = await apiClient.delete(`/bank-accounts/${accountId}/tags/${encodeURIComponent(tag)}`);
    return res.data;
  },
  updateTags: async (accountId: string, tags: string[]) => {
    const res = await apiClient.put(`/bank-accounts/${accountId}/tags`, { tags });
    return res.data;
  },
  setUpiStatus: async (
    accountId: string,
    data: { isUpiActive: boolean; upiStatus?: 'ACTIVE' | 'EXHAUSTED' | 'INACTIVE'; reason?: string }
  ) => {
    const res = await apiClient.patch(`/bank-accounts/${accountId}/upi-status`, data);
    return res.data;
  },
  getEmployeeAccounts: async (employeeId: string) => {
    const res = await apiClient.get<{ bankAccounts: EmployeeBankAccount[] }>(`/bank-accounts/employee/${employeeId}`);
    return res.data?.bankAccounts || [];
  },
  assignToEmployee: async (employeeId: string, data: {
    bankAccountId?: string;
    accountNumber?: string;
    bankName?: string;
    ifscCode?: string;
    accountHolderName?: string;
    employeeAccount?: string;
    bankUsername?: string;
    bankPassword?: string;
    tags?: string[];
    customTags?: string[];
    isPrimary?: boolean;
  }) => {
    const res = await apiClient.post(`/bank-accounts/employee/${employeeId}`, data);
    return res.data;
  },
  setPrimary: async (employeeId: string, bankAccountId: string) => {
    const res = await apiClient.patch(`/bank-accounts/employee/${employeeId}/primary/${bankAccountId}`);
    return res.data;
  },
  removeFromEmployee: async (employeeId: string, bankAccountId: string) => {
    const res = await apiClient.delete(`/bank-accounts/employee/${employeeId}/${bankAccountId}`);
    return res.data;
  },
};
