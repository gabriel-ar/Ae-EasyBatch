#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <wincred.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

//ExtendScript's direct-access ABI. Its integers are 32-bit, which makes this 16 bytes on 64-bit Windows.
typedef struct {
  union { int32_t integer; double number; char *string; void *object; } data;
  int32_t type;
  int32_t filler;
} TaggedData;
_Static_assert(sizeof(TaggedData) == 16, "TaggedData must match ExtendScript's 64-bit Windows layout");

enum { kTypeString = 4, kMaxIdentifier = 256 };

//Request fields are separate strings, so no JSON is parsed here.
static const char signature[] = "Execute_ssss";

static BOOL ValidIdentifier(const char *value) {
  size_t length = 0;
  for (; value[length]; length++) {
    char c = value[length];
    if (length >= kMaxIdentifier || !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
      c == '.' || c == '_' || c == ':' || c == '/' || c == '@' || c == '-')) return FALSE;
  }
  return length > 0;
}

static BOOL ValidUtf8(const char *value, size_t length) {
  return length > 0 && length <= INT_MAX &&
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, (int)length, NULL, 0) > 0;
}

//The separator is outside the identifier alphabet, so a service and key pair can't collide with another.
static void BuildTarget(const char *service, const char *key, wchar_t *target) {
  for (; *service; service++) *target++ = (wchar_t)*service;
  *target++ = L'|';
  for (; *key; key++) *target++ = (wchar_t)*key;
  *target = 0;
}

static char *BuildResponse(DWORD status, const char *value, size_t value_length) {
  char prefix[16];
  int prefix_length = snprintf(prefix, sizeof(prefix), "%lu", (unsigned long)status);
  size_t total = (size_t)prefix_length + (value ? 1 + value_length : 0) + 1;
  char *response = HeapAlloc(GetProcessHeap(), 0, total);
  if (!response) return NULL;
  memcpy(response, prefix, (size_t)prefix_length);
  if (value) {
    response[prefix_length] = ':';
    memcpy(response + prefix_length + 1, value, value_length);
  }
  response[total - 1] = 0;
  return response;
}

static char *Run(const char *action, const char *service, const char *key, const char *value) {
  if (!ValidIdentifier(service) || !ValidIdentifier(key)) return BuildResponse(ERROR_INVALID_PARAMETER, NULL, 0);

  wchar_t target[kMaxIdentifier * 2 + 2];
  BuildTarget(service, key, target);

  if (strcmp(action, "get") == 0) {
    PCREDENTIALW credential = NULL;
    if (!CredReadW(target, CRED_TYPE_GENERIC, 0, &credential)) return BuildResponse(GetLastError(), NULL, 0);

    const char *blob = (const char *)credential->CredentialBlob;
    size_t length = credential->CredentialBlobSize;
    BOOL valid = blob && ValidUtf8(blob, length) && !memchr(blob, 0, length);
    char *response = BuildResponse(valid ? 0 : ERROR_INVALID_DATA, valid ? blob : NULL, valid ? length : 0);

    //The secret was copied into the response, so the credential's own copy can go.
    if (credential->CredentialBlob) SecureZeroMemory(credential->CredentialBlob, credential->CredentialBlobSize);
    CredFree(credential);
    return response;
  }

  if (strcmp(action, "set") == 0) {
    size_t length = strlen(value);
    if (length > CRED_MAX_CREDENTIAL_BLOB_SIZE || !ValidUtf8(value, length)) {
      return BuildResponse(ERROR_INVALID_PARAMETER, NULL, 0);
    }

    CREDENTIALW credential = {0};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = target;
    credential.UserName = L"EasyBatch";
    credential.CredentialBlobSize = (DWORD)length;
    credential.CredentialBlob = (LPBYTE)value;
    //Local-machine persistence survives sign-out, but is never roamed with a domain profile.
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    return BuildResponse(CredWriteW(&credential, 0) ? 0 : GetLastError(), NULL, 0);
  }

  if (strcmp(action, "delete") == 0) {
    return BuildResponse(CredDeleteW(target, CRED_TYPE_GENERIC, 0) ? 0 : GetLastError(), NULL, 0);
  }

  return BuildResponse(ERROR_INVALID_PARAMETER, NULL, 0);
}

__declspec(dllexport) char *ESInitialize(TaggedData *args, int32_t count) {
  (void)args;
  (void)count;
  return (char *)signature;
}

__declspec(dllexport) int32_t ESGetVersion(void) { return 1; }

__declspec(dllexport) void ESTerminate(void) {}

__declspec(dllexport) void ESFreeMem(void *value) {
  //The signature is static; only responses allocated by Run hold secrets.
  if (!value || (const void *)value == (const void *)signature) return;
  SecureZeroMemory(value, strlen((const char *)value));
  HeapFree(GetProcessHeap(), 0, value);
}

__declspec(dllexport) int32_t Execute(TaggedData *args, int32_t count, TaggedData *result) {
  if (count != 4) return 20;
  for (int i = 0; i < count; i++) {
    if (args[i].type != kTypeString || !args[i].data.string) return 20;
  }

  char *response = Run(args[0].data.string, args[1].data.string, args[2].data.string, args[3].data.string);
  if (!response) return -28;
  result->data.string = response;
  result->type = kTypeString;
  return 0;
}
