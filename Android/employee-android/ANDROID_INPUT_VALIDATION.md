# Android input validation

Client-side validation is implemented in `app/src/main/java/com/example/util/AndroidInputValidator.kt` and is repeated at the repository boundary where a request is submitted. Backend validation remains authoritative.

## Rules implemented

- Login: non-empty identifier, email syntax when the identifier contains `@`, password non-empty and bounded length.
- Website: valid HTTP/HTTPS URL or domain; a missing scheme is normalized to HTTPS; credentials in URL are rejected.
- Bank account: digits only, 6–18 digits.
- IFSC: 11 characters, four letters, zero, then six alphanumeric characters; normalized to uppercase.
- Reference ID: 3–64 characters; letters, digits, dot, underscore, slash and hyphen.
- Money: positive finite value, at most two decimal places and bounded precision; withdrawals cannot exceed available balance.
- Money request reason: required, at most 500 characters; normal multiline notes are allowed.
- Payment proof: JPEG, PNG or WEBP; MIME and file signature must agree; file size is at most 5 MB; image must decode and stay within dimension/pixel limits. The app converts the selected content URI to a base64 data URL before submission.
- Duplicate submission: daily-entry and bank-account submission guards are applied in the ViewModel; money requests also guard against repeat taps while loading.
- Backend URL: only a valid HTTP/HTTPS URL is saved from the profile settings.

## Run Android unit tests

From `Android/employee-android` on a machine with Android Studio/Gradle configured:

```powershell
./gradlew.bat testDebugUnitTest
```

The source archive currently does not contain `gradlew.bat` or `gradle-wrapper.jar`; generate/restore the Gradle wrapper from Android Studio or a trusted Gradle installation before running this command.

The new pure validator test class is `app/src/test/java/com/example/util/AndroidInputValidatorTest.kt`.
