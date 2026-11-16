package com.example.ui.viewmodel

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.AttendanceRecord
import com.example.data.repository.WorkLedgerRepository
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class AttendanceUiState(
    val hasLocationPermission: Boolean = false,
    val isLocating: Boolean = false,
    val currentLatitude: Double? = null,
    val currentLongitude: Double? = null,
    val currentAccuracy: Float? = null,
    val locationTimestamp: String? = null,
    val isAccuracyAcceptable: Boolean = true,
    val activeAttendance: AttendanceRecord? = null,
    val lastAttendance: AttendanceRecord? = null,
    val attendanceHistory: List<AttendanceRecord> = emptyList(),
    val elapsedShiftTime: String = "00:00:00",
    val isLoading: Boolean = false,
    val isInitialized: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

class AttendanceViewModel(
    private val repository: WorkLedgerRepository,
    private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(AttendanceUiState())
    val uiState: StateFlow<AttendanceUiState> = _uiState.asStateFlow()

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private var timerJob: Job? = null

    fun initialize(employeeId: String) {
        viewModelScope.launch {
            repository.syncDataFromServer(employeeId)
            loadAttendanceStatus(employeeId)
        }
        viewModelScope.launch {
            repository.getAttendanceHistory(employeeId).collect { list ->
                val active = list.firstOrNull { it.status == "ACTIVE" }
                val last = list.firstOrNull { it.status == "COMPLETED" }
                _uiState.value = _uiState.value.copy(
                    activeAttendance = active,
                    lastAttendance = last,
                    attendanceHistory = list,
                    isInitialized = true
                )
                if (active != null) {
                    startShiftTimer(active.checkInTime)
                } else {
                    stopShiftTimer()
                }
            }
        }
    }

    private suspend fun loadAttendanceStatus(employeeId: String) {
        val active = repository.getActiveAttendance(employeeId)
        _uiState.value = _uiState.value.copy(
            activeAttendance = active,
            isInitialized = true
        )
        if (active != null) {
            startShiftTimer(active.checkInTime)
        }
    }

    fun onPermissionResult(granted: Boolean) {
        _uiState.value = _uiState.value.copy(hasLocationPermission = granted)
        if (granted) {
            fetchCurrentLocation()
        }
    }

    @SuppressLint("MissingPermission")
    fun fetchCurrentLocation() {
        _uiState.value = _uiState.value.copy(isLocating = true, error = null)
        try {
            fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                .addOnSuccessListener { location: Location? ->
                    if (location != null) {
                        applyLocation(location)
                    } else {
                        // Fallback to LocationManager if available
                        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                        val lastKnown = lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                            ?: lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                        if (lastKnown != null) {
                            applyLocation(lastKnown)
                        } else {
                            _uiState.value = _uiState.value.copy(
                                isLocating = false,
                                isAccuracyAcceptable = true,
                                error = "Unable to acquire GPS fix. Please ensure location is enabled."
                            )
                        }
                    }
                }
                .addOnFailureListener {
                    _uiState.value = _uiState.value.copy(
                        isLocating = false,
                        error = "GPS fix failed: ${it.localizedMessage ?: "Location unavailable"}"
                    )
                }
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                isLocating = false,
                error = "Location service error: ${e.localizedMessage ?: "Location unavailable"}"
            )
        }
    }

    private fun isGpsEnabled(): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    private fun applyLocation(location: Location) {
        val accuracy = if (location.hasAccuracy()) location.accuracy else 10f
        val acceptable = accuracy <= 35f // GPS discrepancy accuracy gate (under 35 meters)
        _uiState.value = _uiState.value.copy(
            isLocating = false,
            currentLatitude = location.latitude,
            currentLongitude = location.longitude,
            currentAccuracy = accuracy,
            isAccuracyAcceptable = acceptable,
            locationTimestamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(location.time))
        )
    }

    fun checkIn(employeeId: String, onSuccess: () -> Unit) {
        val finePermission = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

        if (!finePermission) {
            _uiState.value = _uiState.value.copy(
                hasLocationPermission = false,
                error = "Precise Location Permission (ACCESS_FINE_LOCATION) is strictly required. Please grant Precise Location."
            )
            return
        }

        if (!isGpsEnabled()) {
            _uiState.value = _uiState.value.copy(
                error = "Location Services (GPS) is turned off. Please turn on Location in device settings to check in."
            )
            fetchCurrentLocation()
            return
        }

        val lat = _uiState.value.currentLatitude
        val lng = _uiState.value.currentLongitude
        if (lat == null || lng == null || (lat == 0.0 && lng == 0.0)) {
            _uiState.value = _uiState.value.copy(
                error = "Acquiring live precise GPS location fix... Please wait a moment for location fix and try checking in again."
            )
            fetchCurrentLocation()
            return
        }

        val acc = _uiState.value.currentAccuracy ?: 10.0f

        _uiState.value = _uiState.value.copy(isLoading = true, error = null, message = null)

        viewModelScope.launch {
            val result = repository.checkIn(employeeId, lat, lng, acc)
            if (result.isSuccess) {
                val record = result.getOrNull()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    activeAttendance = record,
                    message = "Check-in successful! Attendance timestamp recorded."
                )
                record?.let { startShiftTimer(it.checkInTime) }
                onSuccess()
            } else {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = result.exceptionOrNull()?.message ?: "Check-in failed."
                )
            }
        }
    }

    fun checkOut(employeeId: String, remarks: String? = null, onSuccess: () -> Unit) {
        val state = _uiState.value
        val lat = state.currentLatitude ?: 0.0
        val lng = state.currentLongitude ?: 0.0
        val acc = state.currentAccuracy ?: 10.0f

        _uiState.value = state.copy(isLoading = true, error = null, message = null)

        viewModelScope.launch {
            val result = repository.checkOut(employeeId, lat, lng, acc, remarks)
            if (result.isSuccess) {
                stopShiftTimer()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    activeAttendance = null,
                    message = "Check-out completed! Total shift logged."
                )
                onSuccess()
            } else {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = result.exceptionOrNull()?.message ?: "Check-out failed."
                )
            }
        }
    }

    private fun startShiftTimer(checkInIso: String) {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val checkInDate = try { sdf.parse(checkInIso) } catch (_: Exception) { Date() } ?: Date()

            while (isActive) {
                val elapsedMillis = (System.currentTimeMillis() - checkInDate.time).coerceAtLeast(0)
                val hours = elapsedMillis / (1000 * 60 * 60)
                val minutes = (elapsedMillis / (1000 * 60)) % 60
                val seconds = (elapsedMillis / 1000) % 60
                _uiState.value = _uiState.value.copy(
                    elapsedShiftTime = String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
                )
                delay(1000)
            }
        }
    }

    private fun stopShiftTimer() {
        timerJob?.cancel()
        timerJob = null
        _uiState.value = _uiState.value.copy(elapsedShiftTime = "00:00:00")
    }

    fun clearFeedback() {
        _uiState.value = _uiState.value.copy(message = null, error = null)
    }
}
