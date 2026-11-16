import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Calendar,
  IndianRupee,
  FileText,
  Clock,
  History,
  Shield,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  MapPin,
  ExternalLink,
  CreditCard,
  Building,
  Plus,
  Tag,
  Trash2,
  Star,
  Check,
  Zap,
  ZapOff,
  Edit3,
} from 'lucide-react';
import {
  EmployeeProfile,
  AttendancePunch,
  EntrySubmission,
  FinancialLedger,
  EmployeeUpdateLog,
  EmployeeBankAccount,
  BankAccount,
} from '../../types';
import { subAdminApi, superAdminApi, bankAccountApi } from '../../services/api';
import { StatusBadge } from './StatusBadge';
import { ScreenshotModal } from './ScreenshotModal';

interface EmployeeDetailModalProps {
  employeeId: string | null;
  isOpen: boolean;
  initialEmployee?: EmployeeProfile | null;
  onClose: () => void;
  onViewScreenshot?: (entry: EntrySubmission) => void;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  employeeId,
  isOpen,
  initialEmployee,
  onClose,
  onViewScreenshot,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'attendance' | 'entries' | 'finance' | 'updates'>('overview');
  const [loading, setLoading] = useState<boolean>(!initialEmployee);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(initialEmployee || null);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [entries, setEntries] = useState<EntrySubmission[]>([]);
  const [ledger, setLedger] = useState<FinancialLedger[]>([]);
  const [updates, setUpdates] = useState<EmployeeUpdateLog[]>([]);
  const [isBankUnmasked, setIsBankUnmasked] = useState<boolean>(false);
  const [selectedProofEntry, setSelectedProofEntry] = useState<EntrySubmission | null>(null);

  // Multi-Bank Accounts & Custom Tags State
  const [bankAccounts, setBankAccounts] = useState<EmployeeBankAccount[]>([]);
  const [allCompanyAccounts, setAllCompanyAccounts] = useState<BankAccount[]>([]);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState<boolean>(false);
  const [addAccountMode, setAddAccountMode] = useState<'existing' | 'new'>('existing');
  const [selectedCompanyAccountId, setSelectedCompanyAccountId] = useState<string>('');
  const [newAccBankName, setNewAccBankName] = useState<string>('HDFC Bank');
  const [newAccNumber, setNewAccNumber] = useState<string>('');
  const [newAccIfsc, setNewAccIfsc] = useState<string>('HDFC0001234');
  const [newAccHolder, setNewAccHolder] = useState<string>('');
  const [newAccUsername, setNewAccUsername] = useState<string>('');
  const [newAccPassword, setNewAccPassword] = useState<string>('');
  const [newAccTags, setNewAccTags] = useState<string>('Field Float, Operations');
  const [newAccIsPrimary, setNewAccIsPrimary] = useState<boolean>(false);
  const [activeTagAccId, setActiveTagAccId] = useState<string | null>(null);
  const [quickTagText, setQuickTagText] = useState<string>('');
  const [editingTagsAccId, setEditingTagsAccId] = useState<string | null>(null);
  const [editTagsText, setEditTagsText] = useState<string>('');
  const [editTagsSaving, setEditTagsSaving] = useState<boolean>(false);

  const loadAccounts = async (empId: string) => {
    try {
      const [accs, companyAccs] = await Promise.all([
        bankAccountApi.getEmployeeAccounts(empId),
        bankAccountApi.getAll(),
      ]);
      setBankAccounts(accs);
      setAllCompanyAccounts(companyAccs);
      if (companyAccs.length > 0 && !selectedCompanyAccountId) {
        setSelectedCompanyAccountId(companyAccs[0].id);
      }
    } catch (e) {
      console.warn('Failed to fetch bank accounts:', e);
    }
  };

  // Immediate state synchronization on prop change
  useEffect(() => {
    if (initialEmployee) {
      setEmployee(initialEmployee);
      setLoading(false);
    }
  }, [initialEmployee, employeeId]);

  useEffect(() => {
    if (!isOpen || !employeeId) return;

    if (initialEmployee) {
      setEmployee(initialEmployee);
      setLoading(false);
    }

    const fetchDetail = async () => {
      if (!initialEmployee && !employee) setLoading(true);
      try {
        let raw: any = null;
        try {
          raw = await superAdminApi.getEmployeeDetail(employeeId);
        } catch {
          raw = await subAdminApi.getEmployeeDetail(employeeId);
        }
        const data = raw?.data || raw;
        const emp = data?.employee || data?.data?.employee || (data?.id ? data : null);
        if (emp) {
          setEmployee((prev) => ({ ...(prev || {}), ...emp }));
        } else if (!employee && !initialEmployee) {
          const all = await superAdminApi.getAllEmployees().catch(() => subAdminApi.getEmployees());
          const cleanId = String(employeeId).trim().toLowerCase();
          const found = all.find(
            (e) =>
              String(e.id).toLowerCase() === cleanId ||
              String(e.employeeCode || '').toLowerCase() === cleanId ||
              String(e.email || '').toLowerCase() === cleanId ||
              String((e as any).userId || '').toLowerCase() === cleanId ||
              String(e.name || '').toLowerCase().includes(cleanId)
          ) || (all.length > 0 ? all[0] : null);
          if (found) setEmployee(found);
        }
        setPunches(data?.punches || data?.data?.punches || []);
        setEntries(data?.entries || data?.data?.entries || []);
        setLedger(data?.ledger || data?.data?.ledger || []);
        setUpdates(data?.updates || data?.data?.updates || []);
        setIsBankUnmasked(false);

        await loadAccounts(employeeId);
      } catch (err) {
        console.warn('Failed to load employee details, using fallback/list state:', err);
        if (!employee && !initialEmployee) {
          try {
            const all = await superAdminApi.getAllEmployees().catch(() => subAdminApi.getEmployees());
            const cleanId = String(employeeId).trim().toLowerCase();
            const found = all.find(
              (e) =>
                String(e.id).toLowerCase() === cleanId ||
                String(e.employeeCode || '').toLowerCase() === cleanId ||
                String(e.email || '').toLowerCase() === cleanId ||
                String((e as any).userId || '').toLowerCase() === cleanId ||
                String(e.name || '').toLowerCase().includes(cleanId)
            ) || (all.length > 0 ? all[0] : null);
            if (found) setEmployee(found);
          } catch {}
        }
        await loadAccounts(employeeId).catch(() => {});
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [isOpen, employeeId]);

  if (!isOpen || !employeeId) return null;

  const handleToggleBankMask = async () => {
    if (!isBankUnmasked && employee) {
      // Log unmask audit to backend
      try {
        await subAdminApi.logUnmaskAudit(employee.id, employee.name);
      } catch (err) {
        console.error('Failed to log unmask audit:', err);
      }
    }
    setIsBankUnmasked(!isBankUnmasked);
  };

  const handleAddOrLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    try {
      if (addAccountMode === 'existing') {
        if (!selectedCompanyAccountId) return;
        await bankAccountApi.assignToEmployee(employee.id, {
          bankAccountId: selectedCompanyAccountId,
          isPrimary: newAccIsPrimary,
          customTags: ['Shared Operations'],
        });
      } else {
        if (!newAccNumber || !newAccBankName || !newAccIfsc) {
          alert('Account number, Bank name, and IFSC code are required.');
          return;
        }
        const tags = newAccTags.split(',').map((t) => t.trim()).filter(Boolean);
        await bankAccountApi.assignToEmployee(employee.id, {
          accountNumber: newAccNumber.trim(),
          bankName: newAccBankName.trim(),
          ifscCode: newAccIfsc.trim().toUpperCase(),
          accountHolderName: newAccHolder.trim() || employee.name,
          employeeAccount: newAccHolder.trim() || employee.name,
          bankUsername: newAccUsername.trim() || undefined,
          bankPassword: newAccPassword.trim() || undefined,
          tags,
          isPrimary: newAccIsPrimary,
        });
      }
      setIsAddAccountOpen(false);
      setNewAccNumber('');
      setNewAccHolder('');
      setNewAccUsername('');
      setNewAccPassword('');
      await loadAccounts(employee.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to assign bank account');
    }
  };

  const handleSetPrimary = async (bankAccountId: string) => {
    if (!employee) return;
    try {
      await bankAccountApi.setPrimary(employee.id, bankAccountId);
      await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to set primary account:', err);
    }
  };

  const handleRemoveAccount = async (bankAccountId: string) => {
    if (!employee) return;
    if (!confirm('Are you sure you want to unlink this bank account from this employee?')) return;
    try {
      await bankAccountApi.removeFromEmployee(employee.id, bankAccountId);
      await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to unlink bank account:', err);
    }
  };

  const handleQuickAddTag = async (bankAccountId: string) => {
    if (!quickTagText.trim()) return;
    try {
      await bankAccountApi.addTag(bankAccountId, quickTagText.trim());
      setQuickTagText('');
      setActiveTagAccId(null);
      if (employee) await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to add custom tag:', err);
    }
  };

  const handleRemoveTag = async (bankAccountId: string, tag: string) => {
    try {
      await bankAccountApi.removeTag(bankAccountId, tag);
      if (employee) await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleStartEditTags = (acc: EmployeeBankAccount) => {
    setEditingTagsAccId(acc.bankAccountId);
    setEditTagsText((acc.tags || []).join(', '));
    setActiveTagAccId(null);
  };

  const handleSaveEditTags = async (bankAccountId: string) => {
    setEditTagsSaving(true);
    try {
      const parsedTags = editTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await bankAccountApi.updateTags(bankAccountId, parsedTags);
      setEditingTagsAccId(null);
      if (employee) await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to update tags:', err);
    } finally {
      setEditTagsSaving(false);
    }
  };

  const handleToggleUpi = async (acc: EmployeeBankAccount) => {
    const nextActive = acc.isUpiActive === false;
    try {
      await bankAccountApi.setUpiStatus(acc.bankAccountId, {
        isUpiActive: nextActive,
        upiStatus: nextActive ? 'ACTIVE' : 'EXHAUSTED',
        reason: nextActive
          ? undefined
          : 'Daily UPI transfer limit exhausted (₹1,00,000 quota reached) - Please use IMPS / Netbanking',
      });
      if (employee) await loadAccounts(employee.id);
    } catch (err) {
      console.error('Failed to toggle UPI status:', err);
    }
  };

  const maskedBankNumber = employee?.bankAccountNumber
    ? `•••• •••• •••• ${employee.bankAccountNumber.slice(-4)}`
    : 'N/A';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'profile', label: 'Profile', icon: Shield },
    { id: 'attendance', label: 'Attendance', icon: Calendar, badge: punches.length },
    { id: 'entries', label: 'Entries', icon: FileText, badge: entries.length },
    { id: 'finance', label: 'Financial History', icon: IndianRupee },
    { id: 'updates', label: 'Update History', icon: History, badge: updates.length },
  ];

  const displayEmployee = employee || initialEmployee;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-[#E8E2D8] w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5] shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#880E23] text-white font-bold flex items-center justify-center text-lg shadow-xs">
              {displayEmployee ? displayEmployee.name.charAt(0) : 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-lg leading-none">
                  {displayEmployee?.name || (loading ? 'Loading...' : 'Employee Dossier')}
                </h2>
                {displayEmployee && <StatusBadge status={displayEmployee.status} size="sm" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                {displayEmployee?.employeeCode && <span>{displayEmployee.employeeCode}</span>}
                {displayEmployee?.email && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{displayEmployee.email}</span>
                  </>
                )}
                {displayEmployee?.phone && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{displayEmployee.phone}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-white px-6 gap-2 overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-teal-600 text-teal-700 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading && !displayEmployee ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              Loading detailed records...
            </div>
          ) : !displayEmployee ? (
            <div className="text-center py-12 text-slate-500 text-xs">Employee records not found.</div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Financial & Attendance Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Available Balance
                      </span>
                      <span className="text-2xl font-bold text-teal-700 mt-1 block">
                        ₹{(displayEmployee?.availableBalance ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 mt-1 block">Ready for withdrawal claims</span>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Total Allocated
                      </span>
                      <span className="text-2xl font-bold text-slate-900 mt-1 block">
                        ₹{(displayEmployee?.totalAllocated ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 mt-1 block">Cumulative operational float</span>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Approved Withdrawals
                      </span>
                      <span className="text-2xl font-bold text-slate-900 mt-1 block">
                        ₹{(displayEmployee?.totalApprovedWithdrawals ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 mt-1 block">Settled payouts</span>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Today's Attendance
                      </span>
                      <div className="mt-2">
                        <StatusBadge status={displayEmployee?.attendanceToday || 'ABSENT'} />
                      </div>
                      <span className="text-xs text-slate-400 mt-1.5 block">{displayEmployee?.lastPunch || 'No punch registered'}</span>
                    </div>
                  </div>

                  {/* Quick Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Multi-Bank Accounts & Custom Tags Section */}
                    <div className="col-span-1 md:col-span-2 p-5 bg-white rounded-xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-teal-600" />
                          <h4 className="font-bold text-slate-900 text-sm">
                            Assigned Bank Accounts &amp; Multi-Routing ({bankAccounts.length})
                          </h4>
                          <span className="text-[11px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-semibold border border-teal-200/60">
                            Multi-Account Supported
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleToggleBankMask}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            {isBankUnmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{isBankUnmasked ? 'Mask Numbers' : 'Unmask (Audited)'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsAddAccountOpen(!isAddAccountOpen)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{isAddAccountOpen ? 'Cancel' : 'Add / Link Account'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Collapsible Add / Link Account Form */}
                      {isAddAccountOpen && (
                        <form
                          onSubmit={handleAddOrLinkAccount}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs"
                        >
                          <div className="flex items-center gap-4 border-b border-slate-200/80 pb-2.5">
                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                              <input
                                type="radio"
                                name="accountMode"
                                checked={addAccountMode === 'existing'}
                                onChange={() => setAddAccountMode('existing')}
                                className="text-teal-600 focus:ring-teal-500"
                              />
                              <span>Link Existing Shared Account (1 Account to Multiple Users)</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-800">
                              <input
                                type="radio"
                                name="accountMode"
                                checked={addAccountMode === 'new'}
                                onChange={() => setAddAccountMode('new')}
                                className="text-teal-600 focus:ring-teal-500"
                              />
                              <span>Register New Bank Account</span>
                            </label>
                          </div>

                          {addAccountMode === 'existing' ? (
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">
                                Select Registered Company Account
                              </label>
                              <select
                                value={selectedCompanyAccountId}
                                onChange={(e) => setSelectedCompanyAccountId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                              >
                                {allCompanyAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.bankName} — {acc.accountNumber} (IFSC: {acc.ifscCode}) [{acc.tags.join(', ')}]
                                  </option>
                                ))}
                              </select>
                              <p className="text-[11px] text-slate-500 mt-1">
                                This account will be linked to this employee. Tags and details remain synchronized across all assigned users.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">Employee Account :</label>
                                <input
                                  type="text"
                                  value={newAccHolder}
                                  onChange={(e) => setNewAccHolder(e.target.value)}
                                  placeholder={displayEmployee?.name || 'Account Beneficiary'}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">Account Number :</label>
                                <input
                                  type="text"
                                  value={newAccNumber}
                                  onChange={(e) => setNewAccNumber(e.target.value)}
                                  placeholder="50100492817264"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">IFSC Code :</label>
                                <input
                                  type="text"
                                  value={newAccIfsc}
                                  onChange={(e) => setNewAccIfsc(e.target.value.toUpperCase())}
                                  placeholder="HDFC0001234"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono uppercase focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">Bank Name :</label>
                                <input
                                  type="text"
                                  value={newAccBankName}
                                  onChange={(e) => setNewAccBankName(e.target.value)}
                                  placeholder="e.g. HDFC Bank"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">Bank Username :</label>
                                <input
                                  type="text"
                                  value={newAccUsername}
                                  onChange={(e) => setNewAccUsername(e.target.value)}
                                  placeholder="e.g. corp_ops_hdfc"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400 block mt-0.5">Admin/Sub-Admin eyes only</span>
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">Bank Password :</label>
                                <input
                                  type="password"
                                  value={newAccPassword}
                                  onChange={(e) => setNewAccPassword(e.target.value)}
                                  placeholder="••••••••••••"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400 block mt-0.5">Admin/Sub-Admin eyes only</span>
                              </div>
                              <div className="md:col-span-3">
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Custom Tags (Comma Separated — Syncs Across App)
                                </label>
                                <input
                                  type="text"
                                  value={newAccTags}
                                  onChange={(e) => setNewAccTags(e.target.value)}
                                  placeholder="Field Float, Operations HQ, Salary"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2">
                            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={newAccIsPrimary}
                                onChange={(e) => setNewAccIsPrimary(e.target.checked)}
                                className="rounded text-teal-600 focus:ring-teal-500"
                              />
                              <span>Set as Primary Disbursement Account</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setIsAddAccountOpen(false)}
                                className="px-3 py-1.5 text-slate-600 hover:bg-slate-200/60 rounded-lg"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs"
                              >
                                Save &amp; Link Account
                              </button>
                            </div>
                          </div>
                        </form>
                      )}

                      {/* Bank Accounts Grid */}
                      {bankAccounts.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          No bank accounts assigned to this employee. Click "Add / Link Account" above.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {bankAccounts.map((acc) => (
                            <div
                              key={acc.id}
                              className={`p-3.5 rounded-xl border transition-all ${
                                acc.isPrimary
                                  ? 'bg-teal-50/40 border-teal-200 shadow-xs'
                                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-200/70">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 text-sm">{acc.bankName}</span>
                                    {acc.isUpiActive !== false ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                        <Zap className="w-2.5 h-2.5 text-emerald-600" />
                                        UPI Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300">
                                        <ZapOff className="w-2.5 h-2.5 text-rose-600" />
                                        ⚠️ UPI Exhausted
                                      </span>
                                    )}
                                    {acc.isPrimary && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-teal-600 text-white px-2 py-0.5 rounded-full">
                                        <Star className="w-2.5 h-2.5 fill-current" />
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-500 font-mono">IFSC: {acc.ifscCode}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUpi(acc)}
                                    className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors flex items-center gap-1 ${
                                      acc.isUpiActive !== false
                                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                    title={acc.isUpiActive !== false ? 'Mark UPI as Exhausted' : 'Restore UPI to Active'}
                                  >
                                    {acc.isUpiActive !== false ? (
                                      <>
                                        <ZapOff className="w-2.5 h-2.5 text-rose-600" />
                                        <span>Exhausted</span>
                                      </>
                                    ) : (
                                      <>
                                        <Zap className="w-2.5 h-2.5 text-emerald-600" />
                                        <span>Active</span>
                                      </>
                                    )}
                                  </button>
                                  {!acc.isPrimary && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimary(acc.bankAccountId)}
                                      className="px-2 py-1 text-[11px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200/80 transition-colors"
                                      title="Set as primary"
                                    >
                                      Make Primary
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAccount(acc.bankAccountId)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Unlink account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Alert banner if UPI is Exhausted */}
                              {acc.isUpiActive === false && (
                                <div className="my-2 p-2 bg-rose-50/90 border border-rose-200 rounded-lg text-xs space-y-0.5 text-rose-800">
                                  <div className="flex items-center justify-between font-bold text-[11px]">
                                    <span className="flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                                      UPI Limit Exhausted
                                    </span>
                                    <span className="text-[9px] bg-rose-200 text-rose-900 px-1 py-0.2 rounded font-semibold uppercase">
                                      Use IMPS/Netbanking
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-rose-700">
                                    {acc.upiExhaustedReason ||
                                      'Daily UPI limit exhausted. Advise staff to route withdrawals via IMPS or Netbanking.'}
                                  </p>
                                </div>
                              )}

                              <div className="py-2.5 space-y-1.5 text-xs">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                                      Employee Account :
                                    </span>
                                    <span className="font-semibold text-slate-800">
                                      {acc.employeeAccount || acc.accountHolderName || displayEmployee?.name}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                                      Account Number :
                                    </span>
                                    <span className="font-mono font-bold text-slate-900">
                                      {isBankUnmasked ? acc.accountNumber : acc.maskedAccountNumber}
                                    </span>
                                  </div>
                                </div>

                                {/* Bank Username & Bank Password (Accessible to Admin/Sub-Admin ONLY) */}
                                <div className="p-2 bg-amber-50/70 border border-amber-200/70 rounded-lg">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-amber-900 tracking-wider uppercase">
                                      Confidential Banking Credentials
                                    </span>
                                    <span className="text-[9px] bg-amber-200/80 text-amber-900 px-1.5 py-0.2 rounded font-semibold">
                                      Admin / Sub-Admin Only
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-500 block">Bank Username :</span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {isBankUnmasked ? (acc.bankUsername || 'Not provided') : '••••••••'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Bank Password :</span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {isBankUnmasked ? (acc.bankPassword || 'Not provided') : '••••••••'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Tags List & Quick Tag Addition / Edit */}
                              <div className="pt-2 border-t border-slate-200/70">
                                <div className="flex items-center justify-between gap-1 mb-1.5 flex-wrap">
                                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                                    <Tag className="w-3 h-3 text-slate-400" />
                                    <span>Synchronized Tags</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {editingTagsAccId !== acc.bankAccountId && activeTagAccId !== acc.bankAccountId && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveTagAccId(acc.bankAccountId);
                                            setQuickTagText('');
                                            setEditingTagsAccId(null);
                                          }}
                                          className="text-[11px] font-bold text-teal-700 hover:underline flex items-center gap-0.5"
                                        >
                                          <Plus className="w-3 h-3" /> Add Tag
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditTags(acc)}
                                          className="text-[11px] font-bold text-indigo-700 hover:underline flex items-center gap-0.5"
                                        >
                                          <Edit3 className="w-3 h-3" /> Change Tags
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Active Tag Input */}
                                {activeTagAccId === acc.bankAccountId && (
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <input
                                      type="text"
                                      value={quickTagText}
                                      onChange={(e) => setQuickTagText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleQuickAddTag(acc.bankAccountId);
                                        }
                                      }}
                                      placeholder="e.g. Fuel Float"
                                      className="px-2 py-1 text-xs border border-teal-300 rounded bg-white font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 flex-1"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddTag(acc.bankAccountId)}
                                      className="px-2.5 py-1 bg-teal-600 text-white font-bold text-xs rounded hover:bg-teal-700"
                                    >
                                      Add
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setActiveTagAccId(null)}
                                      className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}

                                {/* Bulk Edit Tags Input */}
                                {editingTagsAccId === acc.bankAccountId && (
                                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 mb-2">
                                    <div className="flex items-center justify-between text-indigo-900 font-bold text-[11px]">
                                      <span>Modify / Change Tags for this Account</span>
                                      <span className="text-[10px] text-indigo-600 font-normal">Comma-separated</span>
                                    </div>
                                    <input
                                      type="text"
                                      value={editTagsText}
                                      onChange={(e) => setEditTagsText(e.target.value)}
                                      placeholder="e.g. Primary, Highway Fuel, Field Float"
                                      className="w-full px-2.5 py-1.5 border border-indigo-300 rounded bg-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-between text-[10px] text-indigo-700">
                                      <span>Syncs to all assigned users &amp; logs to Admin Audit Trail.</span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setEditingTagsAccId(null)}
                                          className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveEditTags(acc.bankAccountId)}
                                          disabled={editTagsSaving}
                                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded flex items-center gap-1 shadow-xs disabled:opacity-50"
                                        >
                                          <Check className="w-3 h-3" />
                                          <span>{editTagsSaving ? 'Saving...' : 'Save Tags'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-1.5">
                                  {acc.tags && acc.tags.length > 0 ? (
                                    acc.tags.map((tag, idx) => {
                                      const logMeta = acc.tagLogs?.find((l) => l.tag.toLowerCase() === tag.toLowerCase());
                                      return (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-200/80 text-slate-800 border border-slate-300/60"
                                          title={logMeta ? `Added by ${logMeta.addedByName} (${logMeta.addedByRole}) on ${logMeta.addedAt ? new Date(logMeta.addedAt).toLocaleString() : 'N/A'}` : undefined}
                                        >
                                          <span>{tag}</span>
                                          {logMeta && logMeta.addedByName && (
                                            <span className="text-[9px] text-slate-500 font-normal">
                                              · {logMeta.addedByName.split(' ')[0]}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveTag(acc.bankAccountId, tag)}
                                            className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                                            title={`Remove ${tag}`}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">No tags assigned</span>
                                  )}
                                </div>

                                {/* Tag Assignment & User Audit Trail */}
                                {acc.tagLogs && acc.tagLogs.length > 0 && (
                                  <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200/90 text-[10px] space-y-1">
                                    <div className="flex items-center gap-1 font-bold text-slate-500 uppercase tracking-wider text-[9px]">
                                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                                      <span>Tag User Audit Trail</span>
                                    </div>
                                    <div className="space-y-1 max-h-24 overflow-y-auto">
                                      {acc.tagLogs.map((log, lIdx) => (
                                        <div
                                          key={lIdx}
                                          className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200/80 text-slate-600 shadow-2xs"
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-800">#{log.tag}</span>
                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200">
                                              {log.addedByRole}
                                            </span>
                                          </div>
                                          <span className="text-slate-500 text-[9px]">
                                            Added by <strong className="text-slate-700 font-semibold">{log.addedByName}</strong>
                                            {log.addedAt && (
                                              <span className="text-slate-400 ml-1">
                                                · {new Date(log.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PROFILE */}
              {activeTab === 'profile' && (
                <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-6">
                  <h4 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">
                    Employee Personal &amp; Organization Master Record
                  </h4>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                    <div>
                      <span className="text-slate-500 block mb-1">Full Legal Name</span>
                      <span className="font-semibold text-slate-900 text-sm">{displayEmployee?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Employee ID Code</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{displayEmployee?.employeeCode}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Employment Status</span>
                      <StatusBadge status={displayEmployee?.status || 'ACTIVE'} />
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Work Email Address</span>
                      <span className="font-medium text-slate-800">{displayEmployee?.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Direct Phone Contact</span>
                      <span className="font-medium text-slate-800">{displayEmployee?.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Onboarding Date</span>
                      <span className="font-medium text-slate-800">
                        {displayEmployee?.createdAt ? new Date(displayEmployee.createdAt).toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Sub-Admin Supervisor</span>
                      <span className="font-semibold text-teal-700">{displayEmployee?.subAdminName || 'Assigned Regional Sub-Admin'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Android Application Status</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle className="w-3.5 h-3.5" /> Paired &amp; Active
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ATTENDANCE */}
              {activeTab === 'attendance' && (
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Attendance Punch Telemetry</h4>
                    <span className="text-xs text-slate-500">{punches.length} records logged</span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date &amp; Time</th>
                        <th className="py-3 px-4">Punch Type</th>
                        <th className="py-3 px-4">GPS Location</th>
                        <th className="py-3 px-4">Geofence Status</th>
                        <th className="py-3 px-4">Work Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {punches.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            No attendance punches recorded yet.
                          </td>
                        </tr>
                      ) : (
                        punches.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-900 block">{p.date}</span>
                              <span className="text-slate-500 text-[11px] font-mono">{p.time}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  p.punchType === 'CHECK_IN'
                                    ? 'bg-teal-50 text-teal-800 border-teal-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {p.punchType}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="block font-medium">{p.address}</span>
                              <span className="text-[11px] font-mono text-slate-400">
                                {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)} (±{p.accuracyMeters}m)
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {p.isLocationDiscrepancy ? (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px]">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Outside Geofence
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                                  <CheckCircle className="w-3.5 h-3.5" /> Verified
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono">
                              {p.workDurationMinutes ? `${Math.floor(p.workDurationMinutes / 60)}h ${p.workDurationMinutes % 60}m` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: ENTRIES */}
              {activeTab === 'entries' && (
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Submitted Payment Entries</h4>
                    <span className="text-xs text-slate-500">{entries.length} submissions</span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Ref ID</th>
                        <th className="py-3 px-4">Claimed Amount</th>
                        <th className="py-3 px-4">Task URL</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Proof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {entries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No entries submitted yet.
                          </td>
                        </tr>
                      ) : (
                        entries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                              {entry.referenceId}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              ₹{entry.withdrawalAmount.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate text-teal-600">
                              <a href={entry.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                                {entry.websiteUrl} <ExternalLink className="w-3 h-3" />
                              </a>
                            </td>
                            <td className="py-3 px-4">
                              <StatusBadge status={entry.status} size="sm" />
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {new Date(entry.submittedAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  if (onViewScreenshot) {
                                    onViewScreenshot(entry);
                                  } else {
                                    setSelectedProofEntry(entry);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-[11px] transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                View Proof
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 5: FINANCIAL HISTORY */}
              {activeTab === 'finance' && (
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Financial Ledger Transactions</h4>
                    <span className="text-xs text-slate-500">{ledger.length} ledger operations</span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Balance After</th>
                        <th className="py-3 px-4">Reference / Notes</th>
                        <th className="py-3 px-4">Created By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {ledger.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No ledger entries found.
                          </td>
                        </tr>
                      ) : (
                        ledger.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 text-slate-500">
                              {new Date(item.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                  item.type === 'ALLOCATION'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                              >
                                {item.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td
                              className={`py-3 px-4 font-bold ${
                                item.type === 'ALLOCATION' ? 'text-emerald-700' : 'text-slate-900'
                              }`}
                            >
                              {item.type === 'ALLOCATION' ? '+' : '-'}₹{item.amount.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                              ₹{item.balanceAfter.toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold block">{item.reference}</span>
                              <span className="text-slate-500 text-[11px]">{item.notes}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {item.createdByName}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 6: UPDATE HISTORY */}
              {activeTab === 'updates' && (
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Profile Field Update History</h4>
                    <span className="text-xs text-slate-500">{updates.length} updates logged</span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Updated Field</th>
                        <th className="py-3 px-4">Previous Value</th>
                        <th className="py-3 px-4">New Value</th>
                        <th className="py-3 px-4">Updated By</th>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Review Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {updates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No profile update events recorded.
                          </td>
                        </tr>
                      ) : (
                        updates.map((upd) => (
                          <tr key={upd.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {upd.fieldName}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {upd.isMasked && !isBankUnmasked ? '•••• •••• ••••' : upd.oldValue}
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-teal-800">
                              {upd.isMasked && !isBankUnmasked ? '•••• •••• ••••' : upd.newValue}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{upd.updatedByName}</td>
                            <td className="py-3 px-4 text-slate-500">
                              {new Date(upd.updatedAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4">
                              <StatusBadge status={upd.reviewStatus} size="sm" />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#FAF8F5] border-t border-[#E8E2D8] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#880E23] hover:bg-[#6B081A] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            Close Detail View
          </button>
        </div>
      </div>

      {/* Payment Proof Verification Lightbox */}
      <ScreenshotModal
        isOpen={!!selectedProofEntry}
        entry={selectedProofEntry}
        onClose={() => setSelectedProofEntry(null)}
      />
    </div>
  );
};
