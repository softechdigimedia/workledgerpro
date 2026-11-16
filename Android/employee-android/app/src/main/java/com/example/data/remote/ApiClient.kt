package com.example.data.remote

import com.example.data.local.TokenStorage
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.ConnectionPool
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiClient(private val tokenStorage: TokenStorage) {

    private var onUnauthorizedListener: (() -> Unit)? = null

    fun setOnUnauthorizedListener(listener: () -> Unit) {
        onUnauthorizedListener = listener
    }

    private val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val authInterceptor = Interceptor { chain ->
        val original = chain.request()
        val requestBuilder = original.newBuilder()

        tokenStorage.getAccessToken()?.let { token ->
            requestBuilder.header("Authorization", "Bearer $token")
        }

        requestBuilder.header("Accept", "application/json")
        requestBuilder.header("Content-Type", "application/json")
        requestBuilder.header("Connection", "close")

        val response = chain.proceed(requestBuilder.build())

        // Instantly catch 401 Unauthorized or expired access token responses
        val isLoginRequest = original.url.encodedPath.contains("auth/login")
        if (response.code == 401 && !isLoginRequest) {
            tokenStorage.clearSession()
            onUnauthorizedListener?.invoke()
        }

        response
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        // Never log request bodies or credentials in shipped builds.
        level = if (com.example.BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                else HttpLoggingInterceptor.Level.NONE
    }

    private val retryInterceptor = Interceptor { chain ->
        val request = chain.request()
        var response: Response? = null
        var exception: IOException? = null
        var tryCount = 0
        val maxTries = 3

        while (tryCount < maxTries && response == null) {
            try {
                response = chain.proceed(request.newBuilder().build())
            } catch (e: IOException) {
                exception = e
                tryCount++
                if (tryCount >= maxTries) throw e
            }
        }
        response ?: throw exception ?: IOException("Request failed after $maxTries retries")
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(0, 1, TimeUnit.NANOSECONDS))
        .addInterceptor(retryInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .retryOnConnectionFailure(true)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    fun createService(): WorkLedgerApiService {
        val baseUrl = tokenStorage.getBaseUrl()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(WorkLedgerApiService::class.java)
    }
}
