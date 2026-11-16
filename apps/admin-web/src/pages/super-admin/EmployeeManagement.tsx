import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Building2,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Key,
} from 'lucide-react';
import { superAdminApi, bankAccountApi } from '../../services/api';
import { EmployeeProfile, BankAccount } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ExportModal } from '../../components/common/ExportModal';
import { EmployeeDetailModal } from '../../components/common/EmployeeDetailModal';

export const GlobalEmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [subAdmins, setSubAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [subAdminFilter, setSubAdminFilter] = useState('ALL');
  const [attendanceFilter, setAttendanceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fund Allocation State
  const [allocatingEmployee, setAllocatingEmployee] = useState<EmployeeProfile | null>(null);
  const [allocationAmount, setAllocationAmount] = useState('');
  const [allocationRemarks, setAllocationRemarks] = useState('');
  const [allocating, setAllocating] = useState(false);

  // Password Reset State (Super Admin Exclusive)
  const [passwordEmployee, setPasswordEmployee] = useState<EmployeeProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // New Employee Form & Multi-Bank Routing
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSubAdminId, setFormSubAdminId] = useState('');
  const [companyBankAccounts, setCompanyBankAccounts] = useState<BankAccount[]>([]);
  const [accountSelectMode, setAccountSelectMode] = useState<'existing' | 'new'>('existing');
  const [selectedCompanyAccId, setSelectedCompanyAccId] = useState('');
  const [formBankName, setFormBankName] = useState('HDFC Bank');
  const [formAccount, setFormAccount] = useState('');
  const [formIfsc, setFormIfsc] = useState('HDFC0001248');
  const [formBankUsername, setFormBankUsername] = useState('');
  const [formBankPassword, setFormBankPassword] = useState('');
  const [formAccountTags, setFormAccountTags] = useState('Primary, Field Float');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empList, saList, compAccs] = await Promise.all([
        superAdminApi.getAllEmployees(),
        superAdminApi.getSubAdmins(),
        bankAccountApi.getAll(),
      ]);
      setEmployees(empList);
      setSubAdmins(saList);
      setCompanyBankAccounts(compAccs);
      if (compAccs.length > 0 && !selectedCompanyAccId) {
        setSelectedCompanyAccId(compAccs[0].id);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      let finalBankName = formBankName;
      let finalAccount = formAccount;
      let finalIfsc = formIfsc;

      if (accountSelectMode === 'existing') {
        const matched = companyBankAccounts.find((a) => a.id === selectedCompanyAccId);
        if (matched) {
          finalBankName = matched.bankName;
          finalAccount = matched.accountNumber;
          finalIfsc = matched.ifscCode;
        }
      }

      const res = await superAdminApi.createEmployee({
        name: formName,
        email: formEmail,
        phone: formPhone,
        subAdminId: formSubAdminId,
        bankName: finalBankName,
        bankAccountNumber: finalAccount,
        ifscCode: finalIfsc,
        locationName: 'Corporate Operations Hub',
      });

      const rawRes = res as any;
      const newEmpId = rawRes?.employee?.id || rawRes?.data?.employee?.id || rawRes?.id || rawRes?.user?.id;
      if (newEmpId) {
        if (accountSelectMode === 'existing') {
          await bankAccountApi.assignToEmployee(newEmpId, {
            bankAccountId: selectedCompanyAccId,
            isPrimary: true,
            customTags: ['Assigned Pool Account'],
          });
        } else if (finalAccount) {
          const tags = formAccountTags.split(',').map((t) => t.trim()).filter(Boolean);
          await bankAccountApi.assignToEmployee(newEmpId, {
            accountNumber: finalAccount.trim(),
            bankName: finalBankName.trim(),
            ifscCode: finalIfsc.trim().toUpperCase(),
            accountHolderName: formName,
            employeeAccount: formName,
            bankUsername: formBankUsername.trim() || undefined,
            bankPassword: formBankPassword.trim() || undefined,
            tags,
            isPrimary: true,
          });
        }
      }

      await fetchData();
      setIsCreateModalOpen(false);
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormAccount('');
      setFormBankUsername('');
      setFormBankPassword('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setCreating(false);
    }
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingEmployee || !allocationAmount || parseFloat(allocationAmount) <= 0) return;
    setAllocating(true);
    try {
      await superAdminApi.allocateFunds({
        employeeId: allocatingEmployee.id,
        amount: parseFloat(allocationAmount),
        remarks: allocationRemarks || 'Capital float injection',
      });
      await fetchData();
      setAllocatingEmployee(null);
      setAllocationAmount('');
      setAllocationRemarks('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to allocate funds');
    } finally {
      setAllocating(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordEmployee) return;
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    setChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      await superAdminApi.changeUserPassword(passwordEmployee.id, newPassword);
      setPasswordSuccess(`Password successfully changed for ${passwordEmployee.name}`);
      setTimeout(() => {
        setPasswordEmployee(null);
        setNewPassword('');
        setPasswordSuccess('');
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || err.message || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(search.toLowerCase());

    const matchesSubAdmin = subAdminFilter === 'ALL' || emp.subAdminId === subAdminFilter;
    const matchesAttendance = attendanceFilter === 'ALL' || emp.attendanceToday === attendanceFilter;
    const matchesStatus = statusFilter === 'ALL' || emp.status === statusFilter;

    return matchesSearch && matchesSubAdmin && matchesAttendance && matchesStatus;
  });

  const totalPages = Math.ceil(filteredEmployees.length / pageSize) || 1;
  const paginatedEmployees = filteredEmployees.slice((page - 1) * pageSize, page * pageSize);

  const exportColumns = [
    { key: 'employeeCode', label: 'Employee ID' },
    { key: 'name', label: 'Employee Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'subAdminName', label: 'Assigned Sub-Admin' },
    { key: 'attendanceToday', label: 'Attendance Status' },
    { key: 'availableBalance', label: 'Available Balance (INR)' },
    { key: 'totalAllocated', label: 'Total Allocated (INR)' },
    { key: 'totalApprovedWithdrawals', label: 'Approved Withdrawals (INR)' },
    { key: 'status', label: 'Account Status' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Global Employee Directory</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[11px] font-semibold">
              <ShieldCheck className="w-3 h-3 text-amber-600" /> Super Admin Exclusive Creation
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Enterprise database of {employees.length} registered field and hub personnel. Only Super Admin has authorization to onboard new employees.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExportOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export to Excel / CSV
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Onboard New Employee
          </button>
        </div>
      </div>

      {/* Filter and Search Ribbon */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by code, name, or email..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Sub-Admin Filter */}
          <select
            value={subAdminFilter}
            onChange={(e) => {
              setSubAdminFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">All Hubs &amp; Supervisors</option>
            {subAdmins.map((sa) => (
              <option key={sa.id} value={sa.id}>
                {sa.name} ({sa.region})
              </option>
            ))}
          </select>

          {/* Attendance Filter */}
          <select
            value={attendanceFilter}
            onChange={(e) => {
              setAttendanceFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">All Attendance States</option>
            <option value="PRESENT">PRESENT</option>
            <option value="CHECKED_IN">CHECKED_IN (Live)</option>
            <option value="MISSING_CHECKOUT">MISSING_CHECKOUT</option>
            <option value="ABSENT">ABSENT</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">All Account Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DEACTIVATED">DEACTIVATED</option>
          </select>
        </div>
      </div>

      {/* Employees Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Employee ID &amp; Name</th>
              <th className="py-3 px-4">Assigned Sub-Admin</th>
              <th className="py-3 px-4">Today's Attendance</th>
              <th className="py-3 px-4">Available Balance</th>
              <th className="py-3 px-4">Withdrawals Settled</th>
              <th className="py-3 px-4">Account Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  Loading employee records...
                </td>
              </tr>
            ) : paginatedEmployees.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No employee records found matching your filters.
                </td>
              </tr>
            ) : (
              paginatedEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-800 font-bold flex items-center justify-center text-xs shrink-0 border border-teal-100">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{emp.name}</span>
                        <span className="text-[11px] font-mono text-slate-500">{emp.employeeCode} · {emp.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-800 block">{emp.subAdminName || 'Direct / HQ'}</span>
                    <span className="text-[10px] text-slate-400">{emp.subAdminRegion || 'Operations HQ'}</span>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={emp.presenceStatus === "IDLE" ? "IDLE" : emp.attendanceToday} size="sm" />
                  </td>
                  <td className="py-3 px-4 font-bold text-teal-700">
                    ₹{emp.availableBalance.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    ₹{emp.totalApprovedWithdrawals.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={emp.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => setAllocatingEmployee(emp)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-semibold transition-colors mr-2"
                    >
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-600" /> Allocate
                    </button>
                    <button
                      onClick={() => {
                        setPasswordEmployee(emp);
                        setNewPassword('');
                        setPasswordError('');
                        setPasswordSuccess('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition-colors mr-2"
                    >
                      <Key className="w-3.5 h-3.5 text-slate-500" /> Password
                    </button>
                    <button
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setSelectedEmployeeId(emp.id);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredEmployees.length)} of {filteredEmployees.length} employees
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-slate-800">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Excel / CSV Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Comprehensive Employee Roster"
        filenamePrefix="Employees_Master_Export"
        data={filteredEmployees}
        availableColumns={exportColumns}
      />

      {/* 7-Tab Comprehensive Detail Modal */}
      <EmployeeDetailModal
        isOpen={!!selectedEmployeeId}
        employeeId={selectedEmployeeId}
        initialEmployee={selectedEmployee || employees.find((e) => e.id === selectedEmployeeId || e.employeeCode === selectedEmployeeId) || null}
        onClose={() => {
          setSelectedEmployeeId(null);
          setSelectedEmployee(null);
        }}
      />

      {/* Onboard Employee Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#FDF2F4] text-[#880E23] rounded-lg border border-[#F8CAD1]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#2D2526] text-sm">Onboard Field Employee</h3>
                  <p className="text-[10px] text-[#74675B]">Super Admin Exclusive Privilege · Enforced via RBAC</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-[#A89B85] hover:text-[#2D2526] transition-colors">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Deepak Joshi"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. deepak@enterprise.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Phone Number</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+91 98765 00000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 block">Bank Account Routing &amp; Tags</span>
                  <span className="text-[10px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-semibold border border-teal-200">
                    1 Account to Multiple Users Supported
                  </span>
                </div>

                <div className="flex items-center gap-4 border-b border-slate-200 pb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800 text-[11px]">
                    <input
                      type="radio"
                      name="selectAccountMode"
                      checked={accountSelectMode === 'existing'}
                      onChange={() => setAccountSelectMode('existing')}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Link Existing Company Account</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800 text-[11px]">
                    <input
                      type="radio"
                      name="selectAccountMode"
                      checked={accountSelectMode === 'new'}
                      onChange={() => setAccountSelectMode('new')}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Register New Bank Account</span>
                  </label>
                </div>

                {accountSelectMode === 'existing' ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Select Registered Account (Shared Across Users)
                    </label>
                    <select
                      value={selectedCompanyAccId}
                      onChange={(e) => setSelectedCompanyAccId(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                      {companyBankAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bankName} — {acc.accountNumber} [{acc.tags.join(', ')}]
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Links the single account number to this new employee. Both employees will share this destination account.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Bank Name :</label>
                        <input
                          type="text"
                          value={formBankName}
                          onChange={(e) => setFormBankName(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-xs"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Account Number :</label>
                        <input
                          type="text"
                          value={formAccount}
                          onChange={(e) => setFormAccount(e.target.value)}
                          placeholder="50100..."
                          className="w-full px-2 py-1.5 border border-slate-200 rounded font-mono bg-white text-xs"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">IFSC Code :</label>
                        <input
                          type="text"
                          value={formIfsc}
                          onChange={(e) => setFormIfsc(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded font-mono bg-white text-xs uppercase"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Bank Username :</label>
                        <input
                          type="text"
                          value={formBankUsername}
                          onChange={(e) => setFormBankUsername(e.target.value)}
                          placeholder="Portal username"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-xs"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Bank Password :</label>
                        <input
                          type="password"
                          value={formBankPassword}
                          onChange={(e) => setFormBankPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Employee Account :</label>
                        <input
                          type="text"
                          value={formName}
                          disabled
                          className="w-full px-2 py-1.5 border border-slate-200 rounded bg-slate-100 text-slate-600 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                        Custom Account Tags (Syncs Across Application)
                      </label>
                      <input
                        type="text"
                        value={formAccountTags}
                        onChange={(e) => setFormAccountTags(e.target.value)}
                        placeholder="Primary, Field Float, Highway Fuel"
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-xs"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-[#DDD5C7] rounded-lg text-[#5A504E] font-semibold hover:bg-[#FAF8F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Saving...' : 'Register Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Funds Modal */}
      {allocatingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-[#2D2526] text-sm">Allocate Operational Float</h3>
              </div>
              <button onClick={() => setAllocatingEmployee(null)} className="text-[#A89B85] hover:text-[#2D2526] transition-colors">
                ✕
              </button>
            </div>

            <form onSubmit={handleAllocateSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                <span className="font-bold block text-slate-900">{allocatingEmployee.name}</span>
                <span className="text-[11px] text-slate-500 font-mono">{allocatingEmployee.employeeCode} · {allocatingEmployee.email}</span>
                <div className="mt-2 text-xs font-semibold text-emerald-700">
                  Current Available Balance: ₹{(allocatingEmployee.availableBalance ?? 0).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Float Amount to Allocate (₹ INR)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] text-sm font-semibold bg-white text-[#2D2526]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={allocationRemarks}
                  onChange={(e) => setAllocationRemarks(e.target.value)}
                  placeholder="e.g. Weekly operational float allocation"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                />
              </div>

              <div className="pt-4 border-t border-[#EBE5DB] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAllocatingEmployee(null)}
                  className="px-4 py-2 border border-[#DDD5C7] rounded-lg text-[#5A504E] font-semibold hover:bg-[#FAF8F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocating || !allocationAmount || parseFloat(allocationAmount) <= 0}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  {allocating ? 'Allocating...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal (Super Admin Exclusive) */}
      {passwordEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#FDF2F4] text-[#880E23] rounded-lg border border-[#F8CAD1]">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#2D2526] text-sm">Reset Employee Password</h3>
                  <p className="text-[10px] text-[#74675B]">Super Admin Exclusive Authority</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPasswordEmployee(null);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                className="text-[#A89B85] hover:text-[#2D2526] transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="font-semibold text-slate-800 text-sm">{passwordEmployee.name}</p>
                <p className="text-slate-500 text-[11px]">{passwordEmployee.email}</p>
                <p className="text-slate-500 text-[11px] font-mono mt-0.5">{passwordEmployee.employeeCode}</p>
              </div>

              {passwordError && (
                <div className="p-2.5 bg-red-50 text-red-700 rounded-lg text-xs border border-red-200">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs border border-emerald-200">
                  {passwordSuccess}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter secure new password"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] text-xs font-mono"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordEmployee(null);
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword || newPassword.length < 6}
                  className="px-4 py-2 bg-[#880E23] hover:bg-[#6D0B1C] text-white font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-colors"
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
