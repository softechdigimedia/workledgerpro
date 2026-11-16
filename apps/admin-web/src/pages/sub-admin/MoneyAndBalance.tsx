import React, { useState, useEffect } from 'react';
import {
  IndianRupee,
  TrendingUp,
  FileCheck,
  Search,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  AlertCircle,
  Inbox,
  Check,
  X,
  Upload,
  Download,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { subAdminApi } from '../../services/api';
import { EmployeeProfile, FinancialLedger, FloatReplenishmentRequest } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { ApproveFloatModal } from '../../components/common/ApproveFloatModal';
import { ExportModal } from '../../components/common/ExportModal';

export const SubAdminMoneyAndBalance: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedEmpId = searchParams.get('employeeId');

  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [ledgerHistory, setLedgerHistory] = useState<FinancialLedger[]>([]);
  const [employeeFinanceData, setEmployeeFinanceData] = useState<any>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [financeOverview, setFinanceOverview] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (key: string) => parts.find((item) => item.type === key)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  });
  const [replenishmentRequests, setReplenishmentRequests] = useState<FloatReplenishmentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Approval Modal State
  const [selectedRequest, setSelectedRequest] = useState<FloatReplenishmentRequest | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  // Allocation Form State
  const [selectedEmpId, setSelectedEmpId] = useState(preselectedEmpId || '');
  const [amount, setAmount] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [emps, reqs, overview] = await Promise.all([
        subAdminApi.getEmployees(),
        subAdminApi.getFloatRequests('PENDING').catch(() => []),
        subAdminApi.getFinanceOverview({ date: selectedDate }),
      ]);
      setEmployees(emps);
      setReplenishmentRequests(reqs);
      setFinanceOverview(overview);

      if (emps.length > 0 && !selectedEmpId) {
        setSelectedEmpId(emps[0].id);
      }

      // Fetch financial statement for first employee or selected
      const targetId = selectedEmpId || preselectedEmpId || (emps.length > 0 ? emps[0].id : null);
      if (targetId) {
        const stmt = await subAdminApi.getEmployeeFinance(targetId, { date: selectedDate });
        setEmployeeFinanceData(stmt);
        setLedgerHistory(stmt.ledger || []);
      }
    } catch (err) {
      console.error('Failed to load financial records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [preselectedEmpId, selectedDate]);

  const handleEmployeeChange = async (id: string) => {
    setSelectedEmpId(id);
    try {
      const stmt = await subAdminApi.getEmployeeFinance(id, { date: selectedDate });
      setEmployeeFinanceData(stmt);
      setLedgerHistory(stmt.ledger || []);
    } catch (err) {
      console.error('Failed to load employee ledger:', err);
    }
  };

  const handleApproveSubmit = async (data: {
    referenceId: string;
    bankAccount: string;
    screenshotUrl: string;
    remarks?: string;
  }) => {
    if (!selectedRequest) return;
    await subAdminApi.approveFloatRequest(selectedRequest.id, data);
    setFeedback({
      type: 'success',
      text: `Approved float replenishment of ₹${selectedRequest.amount.toLocaleString()} for ${selectedRequest.employeeName}. UTR: ${data.referenceId}`,
    });
    setSelectedRequest(null);
    setIsApproveModalOpen(false);
    await fetchData();
    setTimeout(() => setFeedback(null), 6000);
  };

  const handleRejectRequest = async (id: string, employeeName: string) => {
    const reason = window.prompt(`Enter rejection reason for ${employeeName}'s float request:`, 'Exceeds regional budget');
    if (!reason) return;

    try {
      await subAdminApi.rejectFloatRequest(id, reason);
      setFeedback({ type: 'success', text: `Float request for ${employeeName} has been rejected.` });
      await fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.response?.data?.message || 'Failed to reject request.' });
    } finally {
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpId || !amount || parseFloat(amount) <= 0) {
      setFeedback({ type: 'error', text: 'Please enter a valid allocation amount greater than zero.' });
      return;
    }

    setAllocating(true);
    try {
      const res = await subAdminApi.allocateFunds({
        employeeId: selectedEmpId,
        amount: parseFloat(amount),
      });

      setFeedback({
        type: 'success',
        text: `Successfully allocated ₹${parseFloat(amount).toLocaleString()} to ${res.employee.name}. Balance updated.`,
      });

      setAmount('');
      await fetchData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Fund allocation failed.',
      });
    } finally {
      setAllocating(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmpId);


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Hub Working Capital &amp; Float Allocation</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Allocate operational cash buffers directly to field personnel and audit transaction histories.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <div>
            <p className="font-bold">{feedback.type === 'success' ? 'Operation Completed' : 'Action Blocked'}</p>
            <p className="mt-0.5">{feedback.text}</p>
          </div>
        </div>
      )}

      {/* Date-filtered Money Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Money Overview</h3>
          <p className="text-xs text-slate-500">Assigned team totals and selected employee ledger for the selected date</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          Dashboard date
          <input aria-label="Dashboard date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white" />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Daily Money Used" value={`₹${(financeOverview?.metrics?.dailyMoneyUsed ?? 0).toLocaleString()}`} subtitle="Approved expenses on selected date" icon={ArrowUpRight} accentColor="emerald" />
        <StatCard title="Remaining Money" value={`₹${(financeOverview?.metrics?.remainingMoney ?? 0).toLocaleString()}`} subtitle="Balance at end of selected date" icon={TrendingUp} accentColor="blue" />
        <StatCard title="Total Allocated Money" value={`₹${(financeOverview?.metrics?.totalAllocatedMoney ?? 0).toLocaleString()}`} subtitle="Approved allocations on selected date" icon={IndianRupee} accentColor="teal" />
        <StatCard title="Money Added Previous Day" value={`₹${(financeOverview?.metrics?.previousDayMoneyAdded ?? 0).toLocaleString()}`} subtitle="Approved allocations on previous day" icon={FileCheck} accentColor="amber" />
      </div>

      {/* PENDING FLOAT REPLENISHMENT REQUESTS FROM MOBILE EMPLOYEES */}
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
          <div className="p-8 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5 opacity-80" />
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
                    <span className="font-semibold text-slate-700">Note:</span> {req.reason || 'Balance exhausted in field'}
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

      {/* Two Column Section: Allocation Form on Left, Employee Ledger on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Allocation Form */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-lg">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Disburse Working Capital</h3>
              <p className="text-[11px] text-slate-500">Inject money into employee available balance</p>
            </div>
          </div>

          <form onSubmit={handleAllocate} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Beneficiary Employee *
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white font-medium text-slate-800"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employeeCode}) · Available: ₹{emp.availableBalance.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            {selectedEmployee && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Current Balance:</span>
                  <span className="font-bold text-teal-700 text-xs">
                    ₹{selectedEmployee.availableBalance.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Bank Account:</span>
                  <span className="font-mono text-slate-700">
                    •••• {selectedEmployee.bankAccountNumber ? selectedEmployee.bankAccountNumber.slice(-4) : '7264'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Allocation Amount (INR) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold text-sm text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={allocating || !selectedEmpId}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#880E23] hover:bg-[#6B081A] text-white font-bold rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {allocating ? 'Processing Allocation...' : 'Confirm Working Capital Allocation'}
              {!allocating && <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>

        {/* Selected Employee Transaction Statement */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#E8E2D8] shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
            <div>
              <h3 className="font-bold text-[#2D2526] text-sm">
                Financial Statement: {selectedEmployee ? selectedEmployee.name : 'Employee'}
              </h3>
              <p className="text-xs text-[#74675B]">Chronological ledger transactions for selected agent</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#880E23] bg-[#FDF2F4] px-2.5 py-1 rounded border border-[#F8CAD1]">
                Bal: ₹{selectedEmployee ? selectedEmployee.availableBalance.toLocaleString() : 0}
              </span>
              <button
                type="button"
                onClick={() => setIsExportOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[460px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] border-b border-[#E8E2D8] text-[#74675B] font-semibold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Balance After</th>
                  <th className="py-2.5 px-3">Ref &amp; Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {ledgerHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No transactions recorded for this employee yet.
                    </td>
                  </tr>
                ) : (
                  ledgerHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            item.type === 'ALLOCATION'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {item.type === 'ALLOCATION' ? '+ ALLOC' : '- WITHDRAW'}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          item.type === 'ALLOCATION' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {item.type === 'ALLOCATION' ? '+' : '-'}₹{item.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        ₹{item.balanceAfter.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs truncate">
                        <span className="font-semibold block truncate">{item.reference}</span>
                        <span className="text-[10px] text-slate-400 truncate block">{item.notes}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={`Employee Financial Statement: ${selectedEmployee?.name || 'Employee'}`}
        filenamePrefix={`Employee_Finance_${selectedDate}`}
        data={ledgerHistory}
        availableColumns={[
          { key: 'createdAt', label: 'Transaction Date' },
          { key: 'type', label: 'Transaction Type' },
          { key: 'amount', label: 'Amount (INR)' },
          { key: 'balanceBefore', label: 'Balance Before (INR)' },
          { key: 'balanceAfter', label: 'Balance After (INR)' },
          { key: 'reference', label: 'Reference' },
          { key: 'notes', label: 'Notes' },
        ]}
        summary={{
          'Selected Date': selectedDate,
          'Employee': selectedEmployee?.name || 'Employee',
          'Daily Money Used': employeeFinanceData?.metrics?.dailyMoneyUsed ?? 0,
          'Remaining Money': employeeFinanceData?.metrics?.remainingMoney ?? 0,
          'Total Allocated Money': employeeFinanceData?.metrics?.totalAllocatedMoney ?? 0,
          'Money Added Previous Day': employeeFinanceData?.metrics?.previousDayMoneyAdded ?? 0,
        }}
      />

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
