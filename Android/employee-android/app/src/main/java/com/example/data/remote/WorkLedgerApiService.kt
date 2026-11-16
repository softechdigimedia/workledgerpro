package com.example.data.remote

import com.example.data.model.AddBankAccountRequest
import com.example.data.model.AddCustomTagRequest
import com.example.data.model.ApiResponse
import com.example.data.model.AttendanceDataDto
import com.example.data.model.AttendanceRecord
import com.example.data.model.AttendanceStatusResponse
import com.example.data.model.AuthResponse
import com.example.data.model.AuthResponseData
import com.example.data.model.BankAccountsListResponse
import com.example.data.model.DailyWorkEntry
import com.example.data.model.EmployeeBankAccountDto
import com.example.data.model.FinanceResponseData
import com.example.data.model.FinancialSummary
import com.example.data.model.FinancialTransaction
import com.example.data.model.MoneyRequestData
import com.example.data.model.MoneyRequestPayload
import com.example.data.model.PunchRecord
import com.example.data.model.PunchRequest
import com.example.data.model.TagUpdateResponse
import com.example.data.model.ToggleUpiStatusRequest
import com.example.data.model.UpdateBankTagRequest
import com.example.data.model.UpdateCustomTagsRequest
import com.example.data.model.User
import com.squareup.moshi.JsonClass
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val identifier: String,
    val password: String
)

@JsonClass(generateAdapter = true)
data class CheckInRequest(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val deviceTimestamp: String
)

@JsonClass(generateAdapter = true)
data class CheckOutRequest(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val deviceTimestamp: String,
    val remarks: String? = null
)

@JsonClass(generateAdapter = true)
data class CreateEntryRequest(
    val websiteUrl: String,
    val bankAccountNumber: String,
    val referenceId: String,
    val amount: Double,
    val withdrawalAmount: Double,
    val remarks: String? = null,
    val screenshotUrl: String? = null,
    val screenshotDataUrl: String? = null
)

@JsonClass(generateAdapter = true)
data class PresignUploadRequest(
    val fileName: String,
    val mimeType: String,
    val fileSize: Long
)

@JsonClass(generateAdapter = true)
data class PresignUploadResponse(
    val uploadUrl: String,
    val publicUrl: String,
    val fileKey: String
)

@JsonClass(generateAdapter = true)
data class DashboardResponse(
    val user: User,
    val activeAttendance: AttendanceRecord?,
    val financialSummary: FinancialSummary,
    val pendingEntriesCount: Int,
    val recentEntries: List<DailyWorkEntry>
)

interface WorkLedgerApiService {

    @GET("health")
    suspend fun checkHealth(): Response<ApiResponse<Unit>>

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("auth/refresh")
    suspend fun refreshToken(@Body request: Map<String, String>): Response<ApiResponse<AuthResponseData>>

    @POST("auth/logout")
    suspend fun logout(): Response<ApiResponse<Unit>>

    @GET("auth/me")
    suspend fun getMe(): Response<ApiResponse<User>>

    @GET("employee/dashboard")
    suspend fun getDashboard(): Response<ApiResponse<DashboardResponse>>

    @GET("employee/profile")
    suspend fun getProfile(): Response<ApiResponse<User>>

    @GET("employee/finance")
    suspend fun getFinance(): Response<FinanceResponseData>

    @GET("employee/bank-accounts")
    suspend fun getBankAccounts(): Response<ApiResponse<List<EmployeeBankAccountDto>>>

    @GET("employee/bank-accounts")
    suspend fun getAssignedBankAccounts(): Response<BankAccountsListResponse>

    @POST("employee/bank-accounts")
    suspend fun addBankAccount(@Body request: AddBankAccountRequest): Response<ApiResponse<EmployeeBankAccountDto>>

    @POST("employee/bank-accounts/{id}/tags")
    suspend fun appendCustomTags(
        @Path("id") bankAccountId: String,
        @Body request: UpdateCustomTagsRequest
    ): Response<TagUpdateResponse>

    @POST("employee/bank-accounts/{id}/tags")
    suspend fun addCustomTag(
        @Path("id") bankAccountId: String,
        @Body request: AddCustomTagRequest
    ): Response<TagUpdateResponse>

    @PUT("employee/bank-accounts/{id}/tags")
    suspend fun updateCustomTags(
        @Path("id") bankAccountId: String,
        @Body request: UpdateCustomTagsRequest
    ): Response<TagUpdateResponse>

    @PATCH("employee/bank-accounts/{id}/upi-status")
    suspend fun toggleUpiStatus(
        @Path("id") bankAccountId: String,
        @Body request: ToggleUpiStatusRequest
    ): Response<TagUpdateResponse>

    @PUT("employee/bank-accounts/{id}/tags")
    suspend fun updateBankTagPut(
        @Path("id") id: String,
        @Body request: UpdateBankTagRequest
    ): Response<ApiResponse<EmployeeBankAccountDto>>

    @POST("employee/bank-accounts/{id}/tags")
    suspend fun updateBankTagEmployeePost(
        @Path("id") id: String,
        @Body request: UpdateBankTagRequest
    ): Response<ApiResponse<EmployeeBankAccountDto>>

    @POST("bank-accounts/{id}/tags")
    suspend fun updateBankTagPost(
        @Path("id") id: String,
        @Body request: UpdateBankTagRequest
    ): Response<ApiResponse<EmployeeBankAccountDto>>

    @PATCH("employee/bank-accounts/{id}/tag")
    suspend fun updateBankTagPatch(
        @Path("id") id: String,
        @Body request: UpdateBankTagRequest
    ): Response<ApiResponse<EmployeeBankAccountDto>>

    @POST("employee/finance/request")
    suspend fun requestFloatTopUp(@Body request: MoneyRequestPayload): Response<ApiResponse<MoneyRequestData>>

    @GET("employee/attendance")
    suspend fun getAttendance(): Response<ApiResponse<AttendanceDataDto>>

    @GET("employee/attendance/status")
    suspend fun getAttendanceStatus(): Response<AttendanceStatusResponse>

    @POST("employee/attendance/punch")
    suspend fun punchAttendance(@Body request: PunchRequest): Response<ApiResponse<PunchRecord>>

    @GET("employee/attendance/history")
    suspend fun getAttendanceHistory(): Response<ApiResponse<List<AttendanceRecord>>>

    @POST("employee/attendance/check-in")
    suspend fun checkIn(@Body request: CheckInRequest): Response<ApiResponse<AttendanceRecord>>

    @POST("employee/attendance/check-out")
    suspend fun checkOut(@Body request: CheckOutRequest): Response<ApiResponse<AttendanceRecord>>

    @POST("employee/uploads/presign")
    suspend fun getPresignedUploadUrl(@Body request: PresignUploadRequest): Response<ApiResponse<PresignUploadResponse>>

    @POST("employee/entries")
    suspend fun submitEntry(@Body request: CreateEntryRequest): Response<ApiResponse<DailyWorkEntry>>

    @GET("employee/entries")
    suspend fun getEntries(): Response<ApiResponse<List<DailyWorkEntry>>>

    @GET("employee/entries/{id}")
    suspend fun getEntryById(@Path("id") id: String): Response<ApiResponse<DailyWorkEntry>>

    @POST("employee/entries/{id}/cancel")
    suspend fun cancelEntry(@Path("id") id: String): Response<ApiResponse<DailyWorkEntry>>

    @GET("employee/finance/balance")
    suspend fun getBalance(): Response<ApiResponse<FinancialSummary>>

    @GET("employee/finance/history")
    suspend fun getFinancialHistory(): Response<ApiResponse<List<FinancialTransaction>>>
}
