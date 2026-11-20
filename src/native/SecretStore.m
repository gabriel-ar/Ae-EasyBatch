#import <Foundation/Foundation.h>
#import <Security/Security.h>
#include <stdlib.h>
#include <string.h>

//ExtendScript's direct-access ABI. A single JSON string avoids exposing native object types.
typedef struct {
  union { long integer; double number; char *string; void *object; } data;
  long type;
  long filler;
} TaggedData;

static BOOL ValidIdentifier(id value) {
  if (![value isKindOfClass:[NSString class]] || [value length] < 1 || [value length] > 256) return NO;
  NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:
    @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:/@-"] invertedSet];
  return [value rangeOfCharacterFromSet:invalid].location == NSNotFound;
}

static NSDictionary *Run(NSDictionary *request) {
  NSString *service = request[@"service"];
  NSString *key = request[@"key"];
  NSString *action = request[@"action"];
  if (!ValidIdentifier(service) || !ValidIdentifier(key) || ![action isKindOfClass:[NSString class]] ||
    ![@[@"get", @"set", @"delete"] containsObject:action]) return @{ @"status": @(errSecParam) };

  //Use macOS's default file-based Keychain, whose default ACL trusts the creating host app.
  //The data-protection Keychain uses host entitlements that an extension cannot provision.
  NSMutableDictionary *query = [@{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: key,
  } mutableCopy];
  OSStatus status;
  NSString *value = nil;

  if ([action isEqualToString:@"get"]) {
    query[(__bridge id)kSecReturnData] = @YES;
    query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
    CFTypeRef found = NULL;
    status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);
    if (status == errSecSuccess) {
      if (found && CFGetTypeID(found) == CFDataGetTypeID()) {
        value = [[NSString alloc] initWithData:(__bridge NSData *)found encoding:NSUTF8StringEncoding];
      }
      if (!value) status = errSecDecode;
    }
    if (found) CFRelease(found);
  } else if ([action isEqualToString:@"set"]) {
    NSString *secret = request[@"value"];
    if (![secret isKindOfClass:[NSString class]] || !secret.length ||
      [secret rangeOfString:[NSString stringWithFormat:@"%C", (unichar)0]].location != NSNotFound) {
      return @{ @"status": @(errSecParam) };
    }
    NSData *data = [secret dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) return @{ @"status": @(errSecParam) };
    NSMutableDictionary *attributes = [query mutableCopy];
    attributes[(__bridge id)kSecValueData] = data;
    status = SecItemAdd((__bridge CFDictionaryRef)attributes, NULL);
    if (status == errSecDuplicateItem) {
      status = SecItemUpdate((__bridge CFDictionaryRef)query,
        (__bridge CFDictionaryRef)@{ (__bridge id)kSecValueData: data });
    }
  } else {
    status = SecItemDelete((__bridge CFDictionaryRef)query);
  }
  return value && status == errSecSuccess ? @{ @"status": @0, @"value": value } : @{ @"status": @(status) };
}

__attribute__((visibility("default")))
char *ESInitialize(TaggedData *args, long count) {
  (void)args;
  (void)count;
  return "Execute_s";
}

__attribute__((visibility("default")))
long ESGetVersion(void) { return 1; }

__attribute__((visibility("default")))
void ESTerminate(void) {}

__attribute__((visibility("default")))
void ESFreeMem(void *value) {
  free(value);
}

__attribute__((visibility("default")))
long Execute(TaggedData *args, long count, TaggedData *result) {
  if (count != 1 || args[0].type != 4 || !args[0].data.string) return 20;
  @autoreleasepool {
    NSData *input = [[NSString stringWithUTF8String:args[0].data.string] dataUsingEncoding:NSUTF8StringEncoding];
    id request = input ? [NSJSONSerialization JSONObjectWithData:input options:0 error:NULL] : nil;
    NSDictionary *response = [request isKindOfClass:[NSDictionary class]] ? Run(request) : @{ @"status": @(errSecParam) };
    NSData *json = [NSJSONSerialization dataWithJSONObject:response options:0 error:NULL];
    if (!json) return 32;
    result->data.string = calloc(json.length + 1, 1);
    if (!result->data.string) return -28;
    memcpy(result->data.string, json.bytes, json.length);
    result->type = 4;
  }
  return 0;
}
