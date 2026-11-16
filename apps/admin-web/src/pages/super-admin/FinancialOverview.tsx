import React, { useState, useEffect } from 'react';
import {
  IndianRupee,
  TrendingUp,
  Download,
  Filter,
  Search,
  Building,
  UserCheck,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Check,
  X,
} from 'lucide-react';
import { superAdminApi } from '../../services/api';
import { FinancialLedger, FloatReplenishmentRequest } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { ExportModal } from '../../components/common/ExportModal';
import { ApproveFloatModal } from '../../components/common/ApproveFloatModal';

export const FinancialOverview: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(() => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const part = (key: string) => parts.find((item) => item.type === key)?.value || ''; return `${part('year')}-${part('month')}-${part('day')}`; });
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Replenishment Requests & Approval State
  const [replenishmentRequests, setReplenishmentRequests] = useState<FloatReplenishmentRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<FloatReplenishmentRequest | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  // Float Allocation State
  const [employees, setEmployees] = useState<any[]>([]);
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [allocateAmount, setAllocateAmount] = useState('');
  const [allocateRemarks, setAllocateRemarks] = useState('');
  const [allocating, setAllocating] = useState(false);

  const fetchFinance = async (date = selectedDate) => {
    setLoading(true);
    try {
      const [res, emps, reqs] = await Promise.all([
        superAdminApi.getFinance({ date }),
        superAdminApi.getAllEmployees(),
        superAdminApi.getFloatRequests('PENDING').catch(() => []),
      ]);
      setData(res);
      setEmployees(emps || []);
      setReplenishmentRequests(reqs || []);
      if (emps && emps.length > 0 && !targetEmployeeId) {
        setTargetEmployeeId(emps[0].id);
      }
    } catch (err) {
      console.error('Failed to load finance overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveSubmit = async (data: {
    referenceId: string;
    bankAccount: string;
    screenshotUrl: string;
    remarks?: string;
  }) => {
    if (!selectedRequest) return;
    await superAdminApi.approveFloatRequest(selectedRequest.id, data);
    alert(`Approved float replenishment of ₹${selectedRequest.amount.toLocaleString()} for ${selectedRequest.employeeName}. UTR: ${data.referenceId}`);
    setSelectedRequest(null);
    setIsApproveModalOpen(false);
    await fetchFinance();
  };

  const handleRejectRequest = async (id: string, employeeName: string) => {
    const reason = window.prompt(`Enter rejection reason for ${employeeName}'s float request:`, 'Exceeds budget policy');
    if (!reason) return;
    try {
      await superAdminApi.rejectFloatRequest(id, reason);
      alert(`Float request for ${employeeName} has been rejected.`);
      await fetchFinance();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject request.');
    }
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEmployeeId || !allocateAmount || parseFloat(allocateAmount) <= 0) return;
    setAllocating(true);
    try {
      await superAdminApi.allocateFunds({
        employeeId: targetEmployeeId,
        amount: parseFloat(allocateAmount),
        remarks: allocateRemarks || 'Operational float injection',
      });
      await fetchFinance();
      setIsAllocateOpen(false);
      setAllocateAmount('');
      setAllocateRemarks('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to allocate funds');
    } finally {
      setAllocating(false);
    }
  };

  useEffect(() => {
    fetchFinance(selectedDate);
  }, [selectedDate]);

  if (loading || !data) {
    return (
      <div className="h-96 flex items-center justify-center text-slate-400 text-xs">
        Loading financial ledger and capital allocation telemetry...
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalAllocated: data?.totalAllocated ?? 0,
    totalApprovedWithdrawals: data?.totalApprovedWithdrawals ?? 0,
    pendingWithdrawals: data?.pendingWithdrawalsAmount ?? 0,
    availableBalance: data?.remainingAllocation ?? 0,
  };

  const transactions: FinancialLedger[] = data?.transactions || data?.ledger || [];

  const filteredTransactions = transactions.filter((t: FinancialLedger) => {
    const matchesSearch =
      (t.employeeName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.reference || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'ALL' || t.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const employeeSummaryById = new Map<string, any>(
    (data?.employeeSummaries || []).map((summary: any) => [summary.employeeId, summary])
  );

  const exportColumns = [
    { key: 'createdAt', label: 'Timestamp' },
    { key: 'employeeName', label: 'Employee' },
    { key: 'type', label: 'Transaction Type' },
    { key: 'amount', label: 'Amount (INR)' },
    { key: 'balanceBefore', label: 'Balance Before (INR)' },
    { key: 'balanceAfter', label: 'Balance After (INR)' },
    { key: 'reference', label: 'Reference Code' },
    { key: 'createdByName', label: 'Authorized By' },
    { key: 'notes', label: 'Ledger Remarks' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Organization Financial Ledger</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Single Source of Truth: Operational float allocations, field disbursements, and verified withdrawal settlements.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            Dashboard date
            <input
              aria-label="Dashboard date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white"
            />
          </label>
          <button
            onClick={() => setIsExportOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Financial Ledger
          </button>
          <button
            onClick={() => setIsAllocateOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <IndianRupee className="w-4 h-4" />
            Allocate Float
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Daily Money Used"
          value={`₹${(metrics.dailyMoneyUsed ?? 0).toLocaleString()}`}
          subtitle={`Approved expenses on ${selectedDate}`}
          icon={ArrowUpRight}
          accentColor="emerald"
        />
        <StatCard
          title="Remaining Money"
          value={`₹${(metrics.remainingMoney ?? 0).toLocaleString()}`}
          subtitle="Cumulative approved balance at end of selected date"
          icon={TrendingUp}
          accentColor="blue"
        />
        <StatCard
          title="Total Allocated Money"
          value={`₹${(metrics.totalAllocatedMoney ?? 0).toLocaleString()}`}
          subtitle={`Approved allocations on ${selectedDate}`}
          icon={IndianRupee}
          accentColor="teal"
        />
        <StatCard
          title="Money Added Previous Day"
          value={`₹${(metrics.previousDayMoneyAdded ?? 0).toLocaleString()}`}
          subtitle="Approved allocations on the previous calendar day"
          icon={ArrowDownLeft}
          accentColor="amber"
        />
      </div>

      {/* PENDING FLOAT REPLENISHMENT REQUESTS FROM FIELD STAFF */}
      <div className="bg-white rounded-xl border border-amber-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-600 text-white rounded-lg">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Employee Float Replenishment Requests
              </h3>
              <p className="text-[11px] text-slate-500">
                Staff who exhausted their operational float capital and requested top-up from mobile
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
            {replenishmentRequests.length} Pending
          </span>
        </div>

        {replenishmentRequests.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1 opacity-80" />
            <span>No pending float requests. All employee wallets have sufficient balance.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {replenishmentRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{req.employeeName}</span>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {req.employeeCode}
                    </span>
                    <span className="text-[10px] text-slate-400">· {req.department}</span>
                  </div>
                  <p className="text-slate-600">
                    <span className="font-semibold text-slate-700">Reason:</span> {req.reason || 'Balance exhausted in field'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Requested on {new Date(req.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Requested</span>
                    <span className="text-base font-black text-[#880E23]">₹{req.amount.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setIsApproveModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs transition-colors"
                      title="Approve and disburse with UTR reference and screenshot"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve &amp; Disburse
                    </button>
                    <button
                      onClick={() => handleRejectRequest(req.id, req.employeeName)}
                      className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Reject request"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Employee Float Balances Summary */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-teal-600" />
            <h3 className="font-bold text-slate-900 text-sm">Employee Float Balances &amp; Allocation</h3>
          </div>
          <span className="text-xs text-slate-500">Working capital held by registered field staff</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {employees.length === 0 ? (
            <div className="col-span-3 text-center py-6 text-xs text-slate-400">
              No employees registered yet.
            </div>
          ) : (
            employees.map((emp: any) => (
              <div key={emp.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{emp.name}</h4>
                    <p className="text-[11px] text-slate-500 font-mono">{emp.employeeCode}</p>
                  </div>
                  <button
                    onClick={() => {
                      setTargetEmployeeId(emp.id);
                      setIsAllocateOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded border border-teal-200 transition-colors"
                  >
                    <IndianRupee className="w-3 h-3 text-teal-600" /> Allocate
                  </button>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Allocated on selected date:</span>
                    <span className="font-semibold text-slate-800">₹{(employeeSummaryById.get(emp.id)?.allocatedOnDate ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Used on selected date:</span>
                    <span className="font-semibold text-emerald-700">₹{(employeeSummaryById.get(emp.id)?.usedOnDate ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-700">Remaining at end of date:</span>
                    <span className="font-bold text-teal-700">₹{(employeeSummaryById.get(emp.id)?.remainingMoney ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Transaction History Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Immutable Financial Ledger Stream</h3>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ledger by employee or ref..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="ALL">All Operations</option>
              <option value="ALLOCATION">ALLOCATION</option>
              <option value="WITHDRAWAL_APPROVAL">WITHDRAWAL_APPROVAL</option>
            </select>
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Operation Type</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Balance After</th>
              <th className="py-3 px-4">Reference &amp; Notes</th>
              <th className="py-3 px-4">Authorized By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No financial ledger entries match your filter.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx: FinancialLedger) => (
                <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 text-slate-500">
                    {new Date(tx.createdAt).toLocaleDateString()}
                    <span className="text-[10px] block font-mono text-slate-400">
                      {new Date(tx.createdAt).toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{tx.employeeName}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${tx.type === 'ALLOCATION'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                    >
                      {tx.type === 'ALLOCATION' ? (
                        <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3 text-rose-600" />
                      )}
                      {(tx.type || 'ALLOCATION').replace('_', ' ')}
                    </span>
                  </td>
                  <td
                    className={`py-3 px-4 font-bold text-sm ${tx.type === 'ALLOCATION' ? 'text-emerald-700' : 'text-slate-900'
                      }`}
                  >
                    {tx.type === 'ALLOCATION' ? '+' : '-'}₹{(tx.amount ?? 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                    ₹{(tx.balanceAfter ?? 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono font-semibold text-teal-700 block">{tx.reference}</span>
                    <span className="text-[11px] text-slate-500">{tx.notes}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">{tx.createdByName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Complete Financial Ledger Records"
        filenamePrefix="Financial_Ledger_Export"
        data={transactions}
        availableColumns={exportColumns}
        summary={{
          "Selected Date": selectedDate,
          "Daily Money Used": metrics.dailyMoneyUsed ?? 0,
          "Remaining Money": metrics.remainingMoney ?? 0,
          "Total Allocated Money": metrics.totalAllocatedMoney ?? 0,
          "Money Added Previous Day": metrics.previousDayMoneyAdded ?? 0,
        }}
      />

      {/* Allocate Float Modal */}
      {isAllocateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D040A]/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-[#E8E2D8] w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-[#2D2526] text-sm">Allocate Operational Float to Employee</h3>
              </div>
              <button onClick={() => setIsAllocateOpen(false)} className="text-[#A89B85] hover:text-[#2D2526] transition-colors">
                ✕
              </button>
            </div>

            <form onSubmit={handleAllocateSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Select Target Employee / User</label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                >
                  <option value="">-- Choose an employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode || emp.email}) · Current Float: ₹{(emp.availableBalance ?? 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Float Amount (₹ INR)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] text-sm font-semibold bg-white text-[#2D2526]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#5A504E] mb-1">Ledger Notes / Remarks</label>
                <input
                  type="text"
                  value={allocateRemarks}
                  onChange={(e) => setAllocateRemarks(e.target.value)}
                  placeholder="e.g. Working capital injection"
                  className="w-full px-3 py-2 border border-[#DDD5C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#880E23] bg-white text-[#2D2526]"
                />
              </div>

              <div className="pt-4 border-t border-[#EBE5DB] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAllocateOpen(false)}
                  className="px-4 py-2 border border-[#DDD5C7] rounded-lg text-[#5A504E] font-semibold hover:bg-[#FAF8F5] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocating || !targetEmployeeId || !allocateAmount || parseFloat(allocateAmount) <= 0}
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
      {/* Approve Float Replenishment Modal */}
      <ApproveFloatModal
        isOpen={isApproveModalOpen}
        onClose={() => {
          setIsApproveModalOpen(false);
          setSelectedRequest(null);
        }}
        request={selectedRequest}
        onApprove={handleApproveSubmit}
      />
    </div>
  );
};
