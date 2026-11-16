package com.example.data.model

import com.squareup.moshi.JsonClass
import java.util.Locale
import java.util.UUID

@JsonClass(generateAdapter = true)
data class User(
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String? = null,
    val employeeCode: String? = null,
    val name: String = "",
    val email: String = "",
    val role: String = "EMPLOYEE",
    val phone: String? = null,
    val assignedSubAdmin: String? = null,
    val subAdminId: String? = null,
    val status: String? = "ACTIVE"
) {
    val displayCode: String
        get() = when {
            !employeeCode.isNullOrBlank() -> employeeCode
            !employeeId.isNullOrBlank() && (!employeeId.contains("-") || employeeId.length <= 15) -> employeeId
            else -> "EMP-1001"
        }

    val formattedName: String
        get() = if (name.isBlank()) "Employee" else name.split(" ").joinToString(" ") { word ->
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
        }
}

@JsonClass(generateAdapter = true)
data class AuthResponseData(
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: User? = null
)

@JsonClass(generateAdapter = true)
data class AuthResponse(
    val success: Boolean? = true,
    val message: String? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: User? = null,
    val data: AuthResponseData? = null
) {
    fun getEffectiveToken(): String? = accessToken ?: data?.accessToken
    fun getEffectiveRefreshToken(): String? = refreshToken ?: data?.refreshToken
    fun getEffectiveUser(): User? = user ?: data?.user
}

@JsonClass(generateAdapter = true)
data class AttendanceRecord(
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String = "",
    val checkInTime: String = "",
    val checkInLatitude: Double = 0.0,
    val checkInLongitude: Double = 0.0,
    val checkInAccuracy: Float = 0f,
    val checkOutTime: String? = null,
    val checkOutLatitude: Double? = null,
    val checkOutLongitude: Double? = null,
    val checkOutAccuracy: Float? = null,
    val durationMinutes: Long = 0,
    val status: String = "ACTIVE" // ACTIVE, COMPLETED
)

enum class EntryStatus {
    SUBMITTED,
    PENDING,
    APPROVED,
    REJECTED,
    CANCELLED
}

@JsonClass(generateAdapter = true)
data class DailyWorkEntry(
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String = "",
    val websiteUrl: String = "",
    val bankAccountNumberMasked: String = "",
    val referenceId: String = "",
    val amount: Double = 0.0,
    val withdrawalAmount: Double = 0.0,
    val screenshotUrl: String = "",
    val status: EntryStatus = EntryStatus.SUBMITTED,
    val adminRemarks: String? = null,
    val rejectionReason: String? = null,
    val createdAt: String = "",
    val submittedAt: String? = null,
    val updatedAt: String? = null
)

@JsonClass(generateAdapter = true)
data class FinancialSummary(
    val totalAllocated: Double,
    val totalWithdrawn: Double,
    val availableBalance: Double
) {
    val approvedWithdrawals: Double get() = totalWithdrawn
    val pendingWithdrawals: Double get() = 0.0

    companion object {
        fun calculate(allocated: Double, withdrawn: Double): FinancialSummary {
            val available = (allocated - withdrawn).coerceAtLeast(0.0)
            return FinancialSummary(
                totalAllocated = allocated,
                totalWithdrawn = withdrawn,
                availableBalance = available
            )
        }
    }
}

enum class TransactionType {
    ALLOCATION_CREDIT,
    WITHDRAWAL_SUBMITTED,
    WITHDRAWAL_APPROVED,
    PENDING_RESERVATION,
    RESERVATION_RELEASED,
    ADJUSTMENT
}

@JsonClass(generateAdapter = true)
data class FinancialTransaction(
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String,
    val referenceId: String,
    val type: TransactionType,
    val amount: Double,
    val status: String,
    val description: String,
    val timestamp: String
)

@JsonClass(generateAdapter = true)
data class PunchRequest(
    val punchType: String, // "CHECK_IN" or "CHECK_OUT"
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val address: String? = null,
    val notes: String? = null
)

@JsonClass(generateAdapter = true)
data class PunchRecord(
    val id: String = UUID.randomUUID().toString(),
    val punchType: String = "CHECK_IN",
    val time: String? = null,
    val date: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val address: String? = null
)

@JsonClass(generateAdapter = true)
data class AttendanceDataDto(
    val todayStatus: String? = null,
    val punches: List<PunchRecord>? = emptyList()
)

@JsonClass(generateAdapter = true)
data class FinanceEmployeeDto(
    val id: String? = null,
    val name: String? = null,
    val employeeCode: String? = null,
    val availableBalance: Double = 0.0,
    val totalAllocated: Double = 0.0,
    val totalApprovedWithdrawals: Double = 0.0,
    val pendingWithdrawalsCount: Int = 0
)

@JsonClass(generateAdapter = true)
data class FinanceLedgerItemDto(
    val id: String = UUID.randomUUID().toString(),
    val employeeId: String? = null,
    val type: String = "",
    val direction: String? = null,
    val sign: String? = null,
    val isAllocation: Boolean? = null,
    val source: String? = null,
    val createdByName: String? = null,
    val amount: Double = 0.0,
    val balanceBefore: Double? = null,
    val balanceAfter: Double? = null,
    val reference: String? = null,
    val notes: String? = null,
    val createdAt: String = ""
) {
    val isCreditTransaction: Boolean
        get() = isAllocation == true ||
                direction.equals("CREDIT", ignoreCase = true) ||
                sign == "+" ||
                type.contains("ALLOCATION", ignoreCase = true) ||
                type.contains("CREDIT", ignoreCase = true)
}

@JsonClass(generateAdapter = true)
data class FinanceResponseData(
    val success: Boolean? = true,
    val employee: FinanceEmployeeDto? = null,
    val ledger: List<FinanceLedgerItemDto>? = emptyList(),
    val data: FinanceResponseData? = null
) {
    fun getEffectiveEmployee(): FinanceEmployeeDto? = employee ?: data?.employee
    fun getEffectiveLedger(): List<FinanceLedgerItemDto> = ledger ?: data?.ledger ?: emptyList()
}

@JsonClass(generateAdapter = true)
data class EmployeeBankAccountDto(
    val id: String = UUID.randomUUID().toString(),
    val bankAccountId: String? = null,
    val employeeId: String? = null,
    val employeeAccountName: String? = null,
    val accountHolderName: String? = null,
    val employeeAccount: String? = null,
    val bankName: String = "Bank",
    val accountNumber: String = "",
    val accountNumberMasked: String? = null,
    val maskedAccountNumber: String? = null,
    val ifscCode: String? = null,
    val bankUsernameMasked: String = "••••••••",
    val customTag: String = "Primary",
    val statusTag: String = "ACTIVE",
    val tags: List<String> = emptyList(),
    val isPrimary: Boolean = false,
    val isUpiActive: Boolean = true,
    val upiStatus: String? = "ACTIVE"
) {
    val canonicalId: String
        get() = bankAccountId?.takeIf { it.isNotBlank() } ?: id

    val effectiveMaskedNumber: String
        get() = when {
            !accountNumberMasked.isNullOrBlank() -> accountNumberMasked
            !maskedAccountNumber.isNullOrBlank() -> maskedAccountNumber
            accountNumber.length >= 4 -> "•••• •••• ${accountNumber.takeLast(4)}"
            else -> "•••• $accountNumber"
        }

    val isUpiExhausted: Boolean
        get() = !isUpiActive ||
                upiStatus.equals("EXHAUSTED", ignoreCase = true) ||
                statusTag.contains("EXHAUSTED", ignoreCase = true) ||
                customTag.contains("EXHAUSTED", ignoreCase = true) ||
                tags.any { it.contains("EXHAUSTED", ignoreCase = true) }

    val allTagsList: List<String>
        get() {
            val list = tags.filter { it.isNotBlank() }
            if (list.isNotEmpty()) return list
            val split = customTag.split(",", "•", ";").map { it.trim() }.filter { it.isNotBlank() }
            if (split.isNotEmpty()) return split
            return listOf("Primary")
        }

    val displayTag: String
        get() = tags.firstOrNull { it.isNotBlank() } ?: customTag.ifBlank { "Primary" }

    val displayLabel: String
        get() = if (isUpiExhausted) {
            "$bankName ($displayTag) • ⚠️ UPI Exhausted"
        } else {
            "$bankName ($displayTag)"
        }
}

@JsonClass(generateAdapter = true)
data class BankAccountsDataWrapper(
    val bankAccounts: List<EmployeeBankAccountDto> = emptyList()
)

@JsonClass(generateAdapter = true)
data class BankAccountsListResponse(
    val success: Boolean = true,
    val bankAccounts: List<EmployeeBankAccountDto> = emptyList(),
    val data: BankAccountsDataWrapper? = null
) {
    fun getEffectiveAccounts(): List<EmployeeBankAccountDto> =
        bankAccounts.ifEmpty { data?.bankAccounts ?: emptyList() }
}

@JsonClass(generateAdapter = true)
data class AddBankAccountRequest(
    val employeeAccountName: String,
    val accountNumber: String,
    val ifscCode: String,
    val bankName: String,
    val bankUsername: String,
    val bankPassword: String,
    val customTag: String = "Primary"
)

@JsonClass(generateAdapter = true)
data class AddCustomTagRequest(
    val tag: String,
    val customTag: String = tag
)

@JsonClass(generateAdapter = true)
data class UpdateCustomTagsRequest(
    val tags: List<String>
)

@JsonClass(generateAdapter = true)
data class ToggleUpiStatusRequest(
    val isUpiActive: Boolean,
    val upiStatus: String, // "ACTIVE" or "EXHAUSTED"
    val reason: String? = null
)

@JsonClass(generateAdapter = true)
data class TagUpdateResponse(
    val success: Boolean = true,
    val message: String? = null
)

@JsonClass(generateAdapter = true)
data class UpdateBankTagRequest(
    val customTag: String,
    val tag: String = customTag,
    val statusTag: String = "ACTIVE"
)

@JsonClass(generateAdapter = true)
data class MoneyRequestPayload(
    val requestedAmount: Double,
    val reason: String
)

@JsonClass(generateAdapter = true)
data class MoneyRequestData(
    val requestId: String = UUID.randomUUID().toString(),
    val employeeId: String? = null,
    val requestedAmount: Double = 0.0,
    val reason: String? = null,
    val status: String = "PENDING",
    val createdAt: String = ""
)

@JsonClass(generateAdapter = true)
data class ApiResponse<T>(
    val success: Boolean,
    val message: String? = null,
    val data: T? = null,
    val errors: List<String>? = null
)


@JsonClass(generateAdapter = true)
data class AttendanceStatusCurrentSession(
    val id: String,
    val checkInAt: String,
    val status: String
)

@JsonClass(generateAdapter = true)
data class AttendanceStatusResponse(
    val success: Boolean = false,
    val isCheckedIn: Boolean = false,
    val status: String? = null,
    val currentSession: AttendanceStatusCurrentSession? = null
)
