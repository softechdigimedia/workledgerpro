package com.example.data.repository

import com.example.data.local.AllocationEntity
import com.example.data.local.AppDatabase
import com.example.data.local.AttendanceEntity
import com.example.data.local.BankAccountEntity
import com.example.data.local.EntryEntity
import com.example.data.local.TokenStorage
import com.example.data.local.TransactionEntity
import com.example.data.model.AddBankAccountRequest
import com.example.data.model.AddCustomTagRequest
import com.example.data.model.ApiResponse
import com.example.data.model.AttendanceRecord
import com.example.data.model.DailyWorkEntry
import com.example.data.model.EmployeeBankAccountDto
import com.example.data.model.EntryStatus
import com.example.data.model.FinancialSummary
import com.example.data.model.FinancialTransaction
import com.example.data.model.MoneyRequestData
import com.example.data.model.MoneyRequestPayload
import com.example.data.model.PunchRequest
import com.example.data.model.TransactionType
import com.example.data.model.UpdateBankTagRequest
import com.example.data.model.UpdateCustomTagsRequest
import com.example.data.model.User
import com.example.data.remote.ApiClient
import com.example.data.remote.CheckInRequest
import com.example.data.remote.CheckOutRequest
import com.example.data.remote.CreateEntryRequest
import com.example.data.remote.LoginRequest
import com.example.util.AndroidInputValidator
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import retrofit2.Response
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class WorkLedgerRepository(
    private val database: AppDatabase,
    private val tokenStorage: TokenStorage,
    private val apiClient: ApiClient
) {
    private val dao = database.dao()
    private val _financialSummaryState = MutableStateFlow<FinancialSummary?>(null)

    private fun getCurrentIsoTimestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun parseErrorMessage(response: Response<*>): String {
        val errorBody = response.errorBody()?.string()
        if (!errorBody.isNullOrBlank()) {
            try {
                val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
                val adapter = moshi.adapter(ApiResponse::class.java)
                val parsed = adapter.fromJson(errorBody)
                if (parsed != null && !parsed.message.isNullOrBlank()) {
                    return parsed.message
                }
            } catch (_: Exception) {}
        }
        return "Server HTTP ${response.code()}: ${response.message()}"
    }

    // --- Authentication ---
    suspend fun login(identifier: String, pass: String): Result<User> = withContext(Dispatchers.IO) {
        if (identifier.isBlank() || pass.isBlank()) {
            return@withContext Result.failure(Exception("Identifier and password cannot be empty."))
        }
        val response = try {
            apiClient.createService().login(LoginRequest(identifier, pass))
        } catch (e: Exception) {
            return@withContext Result.failure(Exception("Network error: ${e.localizedMessage ?: e.message ?: "Cannot connect to backend server"}"))
        }

        if (response.isSuccessful) {
            val body = response.body()
            val token = body?.getEffectiveToken()
            val refresh = body?.getEffectiveRefreshToken()
            val user = body?.getEffectiveUser()

            if (token != null && user != null) {
                tokenStorage.saveTokens(token, refresh ?: token)
                tokenStorage.saveUser(user)
                try {
                    syncDataFromServer(user.employeeId ?: user.id)
                } catch (_: Exception) {}
                return@withContext Result.success(user)
            } else {
                return@withContext Result.failure(Exception(body?.message ?: "Login failed. Invalid token or user data."))
            }
        } else {
            val errorMsg = parseErrorMessage(response)
            return@withContext Result.failure(Exception(errorMsg))
        }
    }

    suspend fun logout(): Result<Unit> = withContext(Dispatchers.IO) {
        val user = tokenStorage.getUser()
        user?.let { dao.clearActiveAttendance(it.employeeId ?: it.id) }
        try {
            apiClient.createService().logout()
        } catch (_: Exception) {
            // Ignore network errors on logout so session is always cleared locally
        } finally {
            tokenStorage.clearSession()
        }
        Result.success(Unit)
    }

    fun getCurrentUser(): User? = tokenStorage.getUser()

    fun isLoggedIn(): Boolean = tokenStorage.isLoggedIn()

    // --- Sync Data From Server ---
    suspend fun syncDataFromServer(employeeId: String) = withContext(Dispatchers.IO) {
        // Fetch balance and transaction ledger exclusively from GET /api/v1/employee/finance
        try {
            val finResp = apiClient.createService().getFinance()
            if (finResp.isSuccessful) {
                val body = finResp.body()
                val emp = body?.getEffectiveEmployee()
                val ledgerList = body?.getEffectiveLedger() ?: emptyList()

                if (emp != null) {
                    _financialSummaryState.value = FinancialSummary(
                        totalAllocated = emp.totalAllocated,
                        totalWithdrawn = emp.totalApprovedWithdrawals,
                        availableBalance = emp.availableBalance
                    )
                    dao.insertAllocation(
                        AllocationEntity(
                            id = "alloc-server-${employeeId}",
                            employeeId = employeeId,
                            amount = emp.totalAllocated,
                            allocatedAt = getCurrentIsoTimestamp(),
                            notes = "Working Capital Allocation"
                        )
                    )
                }

                ledgerList.forEach { item ->
                    val txType = if (item.isCreditTransaction) {
                        TransactionType.ALLOCATION_CREDIT.name
                    } else {
                        TransactionType.WITHDRAWAL_APPROVED.name
                    }
                    dao.insertTransaction(
                        TransactionEntity(
                            id = item.id,
                            employeeId = employeeId,
                            referenceId = item.reference ?: item.id,
                            type = txType,
                            amount = item.amount,
                            status = "SETTLED",
                            description = item.notes ?: (if (item.isCreditTransaction) "Operational float allocated by Admin" else "Instant withdrawal"),
                            timestamp = item.createdAt.ifBlank { getCurrentIsoTimestamp() }
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // Fetch entries history
        try {
            val entriesResp = apiClient.createService().getEntries()
            if (entriesResp.isSuccessful && entriesResp.body()?.success == true) {
                entriesResp.body()?.data?.forEach { entry ->
                    dao.insertEntry(
                        EntryEntity(
                            id = entry.id,
                            employeeId = employeeId,
                            websiteUrl = entry.websiteUrl ?: "",
                            bankAccountNumberMasked = entry.bankAccountNumberMasked ?: "",
                            referenceId = entry.referenceId,
                            amount = entry.amount,
                            withdrawalAmount = entry.withdrawalAmount,
                            screenshotUrl = entry.screenshotUrl ?: "",
                            status = entry.status.name,
                            adminRemarks = entry.adminRemarks,
                            rejectionReason = entry.rejectionReason,
                            createdAt = entry.createdAt ?: (entry.submittedAt ?: getCurrentIsoTimestamp())
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        // Read authoritative attendance state first. Authentication sessions and attendance
        // sessions are independent; the server may return a new token while the shift stays open.
        var serverActiveSessionId: String? = null
        try {
            val statusResponse = apiClient.createService().getAttendanceStatus()
            if (statusResponse.isSuccessful) {
                val status = statusResponse.body()
                val current = status?.currentSession
                if (status?.isCheckedIn == true && current != null) {
                    serverActiveSessionId = current.id
                    dao.insertAttendance(
                        AttendanceEntity(
                            id = current.id,
                            employeeId = employeeId,
                            checkInTime = current.checkInAt,
                            checkInLatitude = 0.0,
                            checkInLongitude = 0.0,
                            checkInAccuracy = 0f,
                            status = "ACTIVE"
                        )
                    )
                } else {
                    dao.clearActiveAttendance(employeeId)
                }
            }
        } catch (_: Exception) {}

        // Fetch attendance history. Do not insert a second local row for the same open
        // check-in; the authoritative active row above uses the real attendance-session ID.
        try {
            val attResp = apiClient.createService().getAttendance()
            if (attResp.isSuccessful && attResp.body()?.success == true) {
                attResp.body()?.data?.punches?.forEach { punch ->
                    if (serverActiveSessionId != null && punch.id == "pun_in_$serverActiveSessionId") {
                        return@forEach
                    }
                    dao.insertAttendance(
                        AttendanceEntity(
                            id = punch.id,
                            employeeId = employeeId,
                            checkInTime = punch.date ?: getCurrentIsoTimestamp(),
                            checkInLatitude = punch.latitude ?: 0.0,
                            checkInLongitude = punch.longitude ?: 0.0,
                            checkInAccuracy = 0f,
                            status = "COMPLETED"
                        )
                    )
                }
            }
        } catch (_: Exception) {}
    }

    // --- Financial Ledger Calculations ---
    fun getFinancialSummary(employeeId: String): Flow<FinancialSummary> {
        return combine(
            _financialSummaryState,
            dao.getTotalAllocated(employeeId),
            dao.getTotalWithdrawn(employeeId)
        ) { serverSummary, allocated, withdrawn ->
            if (serverSummary != null) {
                serverSummary
            } else {
                val alloc = allocated ?: 0.0
                val withdr = withdrawn ?: 0.0
                FinancialSummary.calculate(alloc, withdr)
            }
        }.flowOn(Dispatchers.IO)
    }

    fun getTransactions(employeeId: String): Flow<List<FinancialTransaction>> {
        return dao.getTransactions(employeeId).map { list ->
            list.map { entity ->
                FinancialTransaction(
                    id = entity.id,
                    employeeId = entity.employeeId,
                    referenceId = entity.referenceId,
                    type = try { TransactionType.valueOf(entity.type) } catch (_: Exception) { TransactionType.ADJUSTMENT },
                    amount = entity.amount,
                    status = entity.status,
                    description = entity.description,
                    timestamp = entity.timestamp
                )
            }
        }.flowOn(Dispatchers.IO)
    }

    // --- Bank Accounts & Custom Tags ---
    fun getBankAccounts(employeeId: String): Flow<List<EmployeeBankAccountDto>> {
        return dao.getBankAccounts(employeeId).map { list ->
            val realAccounts = list.filterNot { it.id.startsWith("bank-default-") }
            val effectiveList = if (realAccounts.isNotEmpty()) realAccounts else list

            effectiveList
                .distinctBy { entity -> "${entity.bankName.trim().lowercase()}-${entity.accountNumber.filter { c -> c.isDigit() }}" }
                .map { entity ->
                    EmployeeBankAccountDto(
                        id = entity.id,
                        bankAccountId = entity.bankAccountId,
                        employeeId = entity.employeeId,
                        employeeAccountName = entity.employeeAccountName,
                        bankName = entity.bankName,
                        accountNumber = entity.accountNumber,
                        accountNumberMasked = entity.accountNumberMasked,
                        ifscCode = entity.ifscCode,
                        bankUsernameMasked = entity.bankUsernameMasked,
                        customTag = entity.customTag,
                        statusTag = entity.statusTag,
                        tags = entity.tagsJoined.split(",").filter { it.isNotBlank() },
                        isPrimary = entity.isPrimary,
                        isUpiActive = entity.isUpiActive,
                        upiStatus = entity.upiStatus
                    )
                }
        }.flowOn(Dispatchers.IO)
    }

    suspend fun syncBankAccounts(employeeId: String) = withContext(Dispatchers.IO) {
        val list: List<EmployeeBankAccountDto> = try {
            val resp1 = apiClient.createService().getAssignedBankAccounts()
            if (resp1.isSuccessful && resp1.body() != null) {
                resp1.body()!!.getEffectiveAccounts()
            } else {
                val resp2 = apiClient.createService().getBankAccounts()
                resp2.body()?.data ?: emptyList()
            }
        } catch (_: Exception) {
            try {
                val resp2 = apiClient.createService().getBankAccounts()
                resp2.body()?.data ?: emptyList()
            } catch (_: Exception) {
                emptyList()
            }
        }

        if (list.isNotEmpty()) {
            dao.clearBankAccountsForEmployee(employeeId)
            val uniqueList = list.distinctBy { dto -> "${dto.bankName.trim().lowercase()}-${dto.accountNumber.filter { c -> c.isDigit() }}" }
            dao.insertBankAccounts(
                uniqueList.map { dto ->
                    BankAccountEntity(
                        id = dto.id,
                        bankAccountId = dto.bankAccountId,
                        employeeId = employeeId,
                        employeeAccountName = dto.employeeAccountName ?: dto.accountHolderName ?: dto.employeeAccount,
                        bankName = dto.bankName,
                        accountNumber = dto.accountNumber,
                        accountNumberMasked = dto.effectiveMaskedNumber,
                        ifscCode = dto.ifscCode,
                        bankUsernameMasked = dto.bankUsernameMasked,
                        customTag = dto.displayTag,
                        statusTag = dto.statusTag,
                        tagsJoined = dto.tags.joinToString(","),
                        isPrimary = dto.isPrimary,
                        isUpiActive = dto.isUpiActive,
                        upiStatus = dto.upiStatus ?: "ACTIVE"
                    )
                }
            )
        }
    }

    suspend fun addBankAccount(
        employeeId: String,
        employeeAccountName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        bankUsername: String,
        bankPassword: String,
        customTag: String
    ): Result<EmployeeBankAccountDto> = withContext(Dispatchers.IO) {
        val nameError = AndroidInputValidator.validateRequiredText(employeeAccountName, "Account holder name", 120)
        val normalizedAccount = AndroidInputValidator.normalizeBankAccount(accountNumber)
        val normalizedIfsc = AndroidInputValidator.normalizeIfsc(ifscCode)
        val validationError = nameError
            ?: (if (normalizedAccount == null) "Bank account number must contain 6–18 digits." else null)
            ?: (if (normalizedIfsc == null) "Enter a valid 11-character IFSC code." else null)
            ?: AndroidInputValidator.validateRequiredText(bankName, "Bank name", 100)
            ?: AndroidInputValidator.validateRequiredText(bankUsername, "Bank username", 120)
            ?: AndroidInputValidator.validateRequiredText(bankPassword, "Bank password", 256)
        if (validationError != null) return@withContext Result.failure(Exception(validationError))

        val req = AddBankAccountRequest(
            employeeAccountName = employeeAccountName.trim(),
            accountNumber = normalizedAccount!!,
            ifscCode = normalizedIfsc!!,
            bankName = bankName.trim(),
            bankUsername = bankUsername.trim(),
            bankPassword = bankPassword.trim(),
            customTag = customTag.ifBlank { "Primary" }.trim()
        )

        val maskedAcc = "•••• •••• ${normalizedAccount!!.takeLast(4)}"
        val newId = "bank-${UUID.randomUUID()}"

        // Save masked local representation ONLY (never save raw username/password)
        dao.insertBankAccount(
            BankAccountEntity(
                id = newId,
                employeeId = employeeId,
                employeeAccountName = employeeAccountName.trim(),
                bankName = bankName.trim(),
                accountNumber = normalizedAccount!!,
                accountNumberMasked = maskedAcc,
                ifscCode = ifscCode.trim(),
                bankUsernameMasked = "••••••••",
                customTag = customTag.ifBlank { "Primary" }.trim(),
                isPrimary = false
            )
        )

        try {
            val response = apiClient.createService().addBankAccount(req)
            if (response.isSuccessful && response.body()?.success == true) {
                val dto = response.body()?.data
                if (dto != null) {
                    dao.insertBankAccount(
                        BankAccountEntity(
                            id = dto.id,
                            bankAccountId = dto.bankAccountId,
                            employeeId = employeeId,
                            employeeAccountName = dto.employeeAccountName ?: dto.accountHolderName ?: dto.employeeAccount,
                            bankName = dto.bankName,
                            accountNumber = dto.accountNumber,
                            accountNumberMasked = dto.effectiveMaskedNumber,
                            ifscCode = dto.ifscCode,
                            bankUsernameMasked = "••••••••",
                            customTag = dto.displayTag,
                            statusTag = dto.statusTag,
                            tagsJoined = dto.tags.joinToString(","),
                            isPrimary = dto.isPrimary,
                            isUpiActive = dto.isUpiActive,
                            upiStatus = dto.upiStatus ?: "ACTIVE"
                        )
                    )
                    return@withContext Result.success(dto)
                }
            }
        } catch (_: Exception) {}

        Result.success(
            EmployeeBankAccountDto(
                id = newId,
                employeeId = employeeId,
                employeeAccountName = employeeAccountName.trim(),
                bankName = bankName.trim(),
                accountNumber = accountNumber.trim(),
                accountNumberMasked = maskedAcc,
                ifscCode = ifscCode.trim(),
                bankUsernameMasked = "••••••••",
                customTag = customTag.ifBlank { "Primary" }.trim(),
                isPrimary = false
            )
        )
    }

    suspend fun updateBankTag(accountId: String, newTag: String, statusTag: String = "ACTIVE"): Result<Unit> = withContext(Dispatchers.IO) {
        if (newTag.isBlank()) {
            return@withContext Result.failure(Exception("Tag name cannot be empty."))
        }
        val cleanTag = newTag.trim()
        val empId = tokenStorage.getUser()?.employeeId ?: tokenStorage.getUser()?.id ?: ""

        val localAccs = dao.getBankAccounts(empId).firstOrNull() ?: emptyList()
        val match = localAccs.firstOrNull { it.id == accountId || it.bankAccountId == accountId }
        var targetId = match?.canonicalId ?: accountId

        dao.updateBankTagInDb(accountId, cleanTag, statusTag)

        if (targetId.startsWith("bank-default-")) {
            if (match != null) {
                val addRes = addBankAccount(
                    employeeId = empId,
                    employeeAccountName = match.employeeAccountName ?: (tokenStorage.getUser()?.name ?: "Employee Account"),
                    accountNumber = match.accountNumber,
                    ifscCode = match.ifscCode ?: "SBIN0001234",
                    bankName = match.bankName,
                    bankUsername = "emp_user",
                    bankPassword = "emp_password_123",
                    customTag = cleanTag
                )
                if (addRes.isSuccess) {
                    targetId = addRes.getOrNull()?.canonicalId ?: accountId
                }
            }
        }

        val tagList = cleanTag.split(",", "•", ";").map { it.trim() }.filter { it.isNotBlank() }
        val effectiveTags = if (tagList.isNotEmpty()) tagList else listOf(cleanTag)

        // 1. Primary: Execute PUT /api/v1/employee/bank-accounts/{id}/tags with {"tags": ["Field Float", "New Tag"]} to replace tags array
        try {
            val req = UpdateCustomTagsRequest(tags = effectiveTags)
            val resp = apiClient.createService().updateCustomTags(bankAccountId = targetId, request = req)
            if (resp.isSuccessful) {
                syncBankAccounts(empId)
                return@withContext Result.success(Unit)
            }
        } catch (_: Exception) {}

        // 2. Fallback: POST /employee/bank-accounts/{id}/tags
        try {
            val req = UpdateCustomTagsRequest(tags = effectiveTags)
            val resp = apiClient.createService().appendCustomTags(bankAccountId = targetId, request = req)
            if (resp.isSuccessful) {
                syncBankAccounts(empId)
                return@withContext Result.success(Unit)
            }
        } catch (_: Exception) {}

        // 2. Try addCustomTag (POST /employee/bank-accounts/{id}/tags) individually
        try {
            var allOk = true
            effectiveTags.forEach { singleTag ->
                val req = AddCustomTagRequest(tag = singleTag, customTag = singleTag)
                val resp = apiClient.createService().addCustomTag(bankAccountId = targetId, request = req)
                if (!resp.isSuccessful) allOk = false
            }
            if (allOk) {
                syncBankAccounts(empId)
                return@withContext Result.success(Unit)
            }
        } catch (_: Exception) {}

        // 3. Try updateBankTagEmployeePost (POST /employee/bank-accounts/{id}/tags)
        try {
            val req = UpdateBankTagRequest(customTag = cleanTag, tag = cleanTag, statusTag = statusTag)
            val resp = apiClient.createService().updateBankTagEmployeePost(id = targetId, request = req)
            if (resp.isSuccessful) {
                syncBankAccounts(empId)
                return@withContext Result.success(Unit)
            }
        } catch (_: Exception) {}

        syncBankAccounts(empId)
        Result.success(Unit)
    }

    // --- Attendance Operations ---
    suspend fun getActiveAttendance(employeeId: String): AttendanceRecord? = withContext(Dispatchers.IO) {
        val entity = dao.getActiveAttendance(employeeId) ?: return@withContext null
        AttendanceRecord(
            id = entity.id,
            employeeId = entity.employeeId,
            checkInTime = entity.checkInTime,
            checkInLatitude = entity.checkInLatitude,
            checkInLongitude = entity.checkInLongitude,
            checkInAccuracy = entity.checkInAccuracy,
            checkOutTime = entity.checkOutTime,
            checkOutLatitude = entity.checkOutLatitude,
            checkOutLongitude = entity.checkOutLongitude,
            checkOutAccuracy = entity.checkOutAccuracy,
            durationMinutes = entity.durationMinutes,
            status = entity.status
        )
    }

    fun getAttendanceHistory(employeeId: String): Flow<List<AttendanceRecord>> {
        return dao.getAttendanceHistory(employeeId).map { list ->
            list.map { entity ->
                AttendanceRecord(
                    id = entity.id,
                    employeeId = entity.employeeId,
                    checkInTime = entity.checkInTime,
                    checkInLatitude = entity.checkInLatitude,
                    checkInLongitude = entity.checkInLongitude,
                    checkInAccuracy = entity.checkInAccuracy,
                    checkOutTime = entity.checkOutTime,
                    checkOutLatitude = entity.checkOutLatitude,
                    checkOutLongitude = entity.checkOutLongitude,
                    checkOutAccuracy = entity.checkOutAccuracy,
                    durationMinutes = entity.durationMinutes,
                    status = entity.status
                )
            }
        }.flowOn(Dispatchers.IO)
    }

    suspend fun checkIn(
        employeeId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float
    ): Result<AttendanceRecord> = withContext(Dispatchers.IO) {
        // Enforce: Prevent multiple open attendance sessions
        val existing = dao.getActiveAttendance(employeeId)
        if (existing != null) {
            return@withContext Result.failure(Exception("You already have an active check-in session in progress."))
        }

        try {
            val punchResponse = apiClient.createService().punchAttendance(
                PunchRequest(
                    punchType = "CHECK_IN",
                    latitude = latitude,
                    longitude = longitude,
                    accuracyMeters = accuracy
                )
            )
            if (punchResponse.isSuccessful && punchResponse.body()?.success == true) {
                val p = punchResponse.body()?.data
                val record = AttendanceRecord(
                    id = p?.id ?: UUID.randomUUID().toString(),
                    employeeId = employeeId,
                    checkInTime = p?.time ?: getCurrentIsoTimestamp(),
                    checkInLatitude = latitude,
                    checkInLongitude = longitude,
                    checkInAccuracy = accuracy,
                    status = "ACTIVE"
                )
                dao.insertAttendance(
                    AttendanceEntity(
                        id = record.id,
                        employeeId = employeeId,
                        checkInTime = record.checkInTime,
                        checkInLatitude = latitude,
                        checkInLongitude = longitude,
                        checkInAccuracy = accuracy,
                        status = "ACTIVE"
                    )
                )
                return@withContext Result.success(record)
            }
        } catch (_: Exception) {}

        try {
            val response = apiClient.createService().checkIn(
                CheckInRequest(
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy,
                    deviceTimestamp = getCurrentIsoTimestamp()
                )
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val record = response.body()?.data
                if (record != null) {
                    dao.insertAttendance(
                        AttendanceEntity(
                            id = record.id,
                            employeeId = employeeId,
                            checkInTime = record.checkInTime,
                            checkInLatitude = record.checkInLatitude,
                            checkInLongitude = record.checkInLongitude,
                            checkInAccuracy = record.checkInAccuracy,
                            status = "ACTIVE"
                        )
                    )
                    return@withContext Result.success(record)
                } else {
                    return@withContext Result.failure(Exception("Check-in failed. Empty data from server."))
                }
            } else {
                return@withContext Result.failure(Exception(parseErrorMessage(response)))
            }
        } catch (e: Exception) {
            return@withContext Result.failure(Exception("Check-in error: ${e.localizedMessage ?: e.message}"))
        }
    }

    suspend fun checkOut(
        employeeId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        remarks: String? = null
    ): Result<AttendanceRecord> = withContext(Dispatchers.IO) {
        val checkOutTime = getCurrentIsoTimestamp()

        try {
            val punchResponse = apiClient.createService().punchAttendance(
                PunchRequest(
                    punchType = "CHECK_OUT",
                    latitude = latitude,
                    longitude = longitude,
                    accuracyMeters = accuracy,
                    notes = remarks
                )
            )
            if (punchResponse.isSuccessful && punchResponse.body()?.success == true) {
                val p = punchResponse.body()?.data
                val existing = dao.getActiveAttendance(employeeId)
                if (existing != null) {
                    dao.updateAttendance(
                        existing.copy(
                            checkOutTime = p?.time ?: checkOutTime,
                            checkOutLatitude = latitude,
                            checkOutLongitude = longitude,
                            checkOutAccuracy = accuracy,
                            status = "COMPLETED"
                        )
                    )
                }
                return@withContext Result.success(
                    AttendanceRecord(
                        id = p?.id ?: UUID.randomUUID().toString(),
                        employeeId = employeeId,
                        checkInTime = existing?.checkInTime ?: checkOutTime,
                        checkInLatitude = existing?.checkInLatitude ?: latitude,
                        checkInLongitude = existing?.checkInLongitude ?: longitude,
                        checkInAccuracy = existing?.checkInAccuracy ?: accuracy,
                        checkOutTime = checkOutTime,
                        checkOutLatitude = latitude,
                        checkOutLongitude = longitude,
                        checkOutAccuracy = accuracy,
                        status = "COMPLETED"
                    )
                )
            }
        } catch (_: Exception) {}

        try {
            val response = apiClient.createService().checkOut(
                CheckOutRequest(
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy,
                    deviceTimestamp = checkOutTime,
                    remarks = remarks
                )
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val record = response.body()?.data
                if (record != null) {
                    val existing = dao.getActiveAttendance(employeeId)
                    if (existing != null) {
                        dao.updateAttendance(
                            existing.copy(
                                checkOutTime = record.checkOutTime ?: checkOutTime,
                                checkOutLatitude = latitude,
                                checkOutLongitude = longitude,
                                checkOutAccuracy = accuracy,
                                durationMinutes = record.durationMinutes,
                                status = "COMPLETED"
                            )
                        )
                    }
                    return@withContext Result.success(record)
                } else {
                    return@withContext Result.failure(Exception("Check-out failed. Empty data from server."))
                }
            } else {
                return@withContext Result.failure(Exception(parseErrorMessage(response)))
            }
        } catch (e: Exception) {
            return@withContext Result.failure(Exception("Check-out error: ${e.localizedMessage ?: e.message}"))
        }
    }

    // --- Work Entries & Financial Transactions ---
    fun getEntries(employeeId: String): Flow<List<DailyWorkEntry>> {
        return dao.getEntries(employeeId).map { list ->
            list.map { entity ->
                DailyWorkEntry(
                    id = entity.id,
                    employeeId = entity.employeeId,
                    websiteUrl = entity.websiteUrl,
                    bankAccountNumberMasked = entity.bankAccountNumberMasked,
                    referenceId = entity.referenceId,
                    amount = entity.amount,
                    withdrawalAmount = entity.withdrawalAmount,
                    screenshotUrl = entity.screenshotUrl,
                    status = try { EntryStatus.valueOf(entity.status) } catch (_: Exception) { EntryStatus.SUBMITTED },
                    adminRemarks = entity.adminRemarks,
                    rejectionReason = entity.rejectionReason,
                    createdAt = entity.createdAt
                )
            }
        }.flowOn(Dispatchers.IO)
    }

    suspend fun submitEntry(
        employeeId: String,
        websiteUrl: String,
        bankAccountNumber: String,
        referenceId: String,
        amount: Double,
        withdrawalAmount: Double,
        screenshotDataUrl: String
    ): Result<DailyWorkEntry> = withContext(Dispatchers.IO) {
        // Enforce Requirement 1: Without check-in, entry is not allowed
        val activeAttendance = dao.getActiveAttendance(employeeId)
        if (activeAttendance == null || activeAttendance.status != "ACTIVE") {
            return@withContext Result.failure(Exception("Check-in required! You must check in before submitting daily work entries."))
        }

        // Validation: Required fields
        val normalizedWebsite = AndroidInputValidator.normalizeWebsite(websiteUrl)
            ?: return@withContext Result.failure(Exception("Please enter a valid http/https website URL."))
        val normalizedBank = AndroidInputValidator.normalizeBankAccount(bankAccountNumber)
            ?: return@withContext Result.failure(Exception("Bank account number must contain 6–18 digits."))
        val normalizedReference = AndroidInputValidator.normalizeReference(referenceId)
            ?: return@withContext Result.failure(Exception("Reference ID must be 3–64 valid characters."))
        AndroidInputValidator.validatePositiveMoney(amount)?.let { return@withContext Result.failure(Exception(it)) }
        AndroidInputValidator.validatePositiveMoney(withdrawalAmount)?.let {
            return@withContext Result.failure(Exception("Withdrawal amount: $it"))
        }
        if (!screenshotDataUrl.matches(Regex("^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$")) || screenshotDataUrl.length > 7_000_000) {
            return@withContext Result.failure(Exception("A valid JPEG, PNG or WEBP payment image (up to 5 MB) is required."))
        }

        // Ledger check: Cannot exceed available balance
        val alloc = (database.openHelper.readableDatabase.let { db ->
            val cursor = db.query("SELECT SUM(amount) FROM employee_allocations WHERE employeeId = '$employeeId'")
            if (cursor.moveToFirst()) cursor.getDouble(0) else 0.0
        })
        val withdrawn = (database.openHelper.readableDatabase.let { db ->
            val cursor = db.query("SELECT SUM(amount) FROM work_entries WHERE employeeId = '$employeeId' AND status != 'CANCELLED'")
            if (cursor.moveToFirst()) cursor.getDouble(0) else 0.0
        })
        val available = (alloc - withdrawn).coerceAtLeast(0.0)

        if (amount > available || withdrawalAmount > available) {
            return@withContext Result.failure(
                Exception("Requested amount exceeds current available balance (₹${String.format(Locale.US, "%.2f", available)}).")
            )
        }

        val maskedBank = if (bankAccountNumber.length > 4) {
            "•••• •••• " + bankAccountNumber.takeLast(4)
        } else {
            "•••• $bankAccountNumber"
        }
        val currentCreated = getCurrentIsoTimestamp()

        // Try remote submission
        try {
            val response = apiClient.createService().submitEntry(
                CreateEntryRequest(
                    websiteUrl = normalizedWebsite,
                    bankAccountNumber = normalizedBank,
                    referenceId = normalizedReference,
                    amount = amount,
                    withdrawalAmount = withdrawalAmount,
                    remarks = "Entry #$referenceId - $websiteUrl",
                    screenshotUrl = screenshotDataUrl,
                    screenshotDataUrl = screenshotDataUrl
                )
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data
                if (data != null) {
                    val entryId = if (data.id.isNotBlank()) data.id else UUID.randomUUID().toString()
                    val finalWeb = if (!data.websiteUrl.isNullOrBlank()) data.websiteUrl else websiteUrl
                    val finalBank = if (!data.bankAccountNumberMasked.isNullOrBlank()) data.bankAccountNumberMasked else maskedBank
                    val finalRef = if (data.referenceId.isNotBlank()) data.referenceId else referenceId
                    val finalAmt = if (data.amount > 0) data.amount else amount
                    val finalWith = if (data.withdrawalAmount > 0) data.withdrawalAmount else withdrawalAmount
                    val finalCreated = if (!data.createdAt.isNullOrBlank()) data.createdAt else (data.submittedAt ?: currentCreated)

                    val entity = EntryEntity(
                        id = entryId,
                        employeeId = employeeId,
                        websiteUrl = finalWeb,
                        bankAccountNumberMasked = finalBank,
                        referenceId = finalRef,
                        amount = finalAmt,
                        withdrawalAmount = finalWith,
                        screenshotUrl = if (!data.screenshotUrl.isNullOrBlank()) data.screenshotUrl else screenshotDataUrl,
                        status = data.status.name,
                        adminRemarks = data.adminRemarks,
                        rejectionReason = data.rejectionReason,
                        createdAt = finalCreated
                    )
                    dao.insertEntry(entity)
                    syncDataFromServer(employeeId)
                    return@withContext Result.success(
                        DailyWorkEntry(
                            id = entity.id,
                            employeeId = entity.employeeId,
                            websiteUrl = entity.websiteUrl,
                            bankAccountNumberMasked = entity.bankAccountNumberMasked,
                            referenceId = entity.referenceId,
                            amount = entity.amount,
                            withdrawalAmount = entity.withdrawalAmount,
                            screenshotUrl = entity.screenshotUrl,
                            status = try { EntryStatus.valueOf(entity.status) } catch (_: Exception) { EntryStatus.SUBMITTED },
                            adminRemarks = entity.adminRemarks,
                            rejectionReason = entity.rejectionReason,
                            createdAt = entity.createdAt
                        )
                    )
                } else {
                    return@withContext Result.failure(Exception("Submission failed. Empty data from server."))
                }
            } else {
                return@withContext Result.failure(Exception(parseErrorMessage(response)))
            }
        } catch (e: Exception) {
            return@withContext Result.failure(Exception("Submission error: ${e.localizedMessage ?: e.message}"))
        }
    }

    suspend fun requestFloatMoney(requestedAmount: Double, reason: String): Result<MoneyRequestData> = withContext(Dispatchers.IO) {
        AndroidInputValidator.validatePositiveMoney(requestedAmount)?.let { return@withContext Result.failure(Exception(it)) }
        AndroidInputValidator.validateReason(reason)?.let { return@withContext Result.failure(Exception(it)) }

        try {
            val response = apiClient.createService().requestFloatTopUp(
                MoneyRequestPayload(
                    requestedAmount = requestedAmount,
                    reason = reason.trim()
                )
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val data = response.body()?.data ?: MoneyRequestData(
                    requestedAmount = requestedAmount,
                    reason = reason,
                    status = "PENDING",
                    createdAt = getCurrentIsoTimestamp()
                )
                return@withContext Result.success(data)
            } else {
                return@withContext Result.failure(Exception(parseErrorMessage(response)))
            }
        } catch (e: Exception) {
            return@withContext Result.failure(Exception("Money request error: ${e.localizedMessage ?: e.message}"))
        }
    }

    suspend fun cancelEntry(entryId: String, employeeId: String): Result<Unit> = withContext(Dispatchers.IO) {
        val entry = dao.getEntryById(entryId)
            ?: return@withContext Result.failure(Exception("Entry not found."))

        if (entry.status != "PENDING") {
            return@withContext Result.failure(Exception("Only PENDING entries can be cancelled."))
        }

        // Try remote cancellation
        try {
            apiClient.createService().cancelEntry(entryId)
        } catch (_: Exception) {
            // Local fallback
        }

        dao.cancelEntry(entryId)

        // If funds were reserved, record a ledger release
        if (entry.withdrawalAmount > 0) {
            dao.insertTransaction(
                TransactionEntity(
                    id = "rel-${UUID.randomUUID()}",
                    employeeId = employeeId,
                    referenceId = entry.referenceId,
                    type = TransactionType.RESERVATION_RELEASED.name,
                    amount = entry.withdrawalAmount,
                    status = "RELEASED",
                    description = "Reservation released upon cancellation of entry #${entry.referenceId}",
                    timestamp = getCurrentIsoTimestamp()
                )
            )
        }

        Result.success(Unit)
    }
}
