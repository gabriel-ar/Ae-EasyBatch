import CSAdapter from "./CSAdapter.ts";
import type { SecretStoreResult } from "./Messaging.ts";

export interface SecretStore {
  Get(key: string): Promise<string | null>;
  Set(key: string, value: string): Promise<void>;
  Delete(key: string): Promise<void>;
}

/**Returns null on platforms where an OS secret store has not been implemented.*/
export function CreateSecretStore(): SecretStore | null {
  const platform = cep_node.require("os").platform();
  return platform === "darwin" ? new MacSecretStore() : platform === "win32" ? new WindowsSecretStore() : null;
}

export type SecretStoreErrorCode = "unsupported" | "invalid-input" | "invalid-data" | "denied" | "unavailable";

type NativePlatform = "darwin" | "win32";

const platform_messages: Record<NativePlatform, Record<"denied" | "unavailable", string>> = {
  darwin: {
    denied: "Keychain access was denied or requires unlocking. Unlock your login keychain and try again.",
    unavailable: "Could not access native macOS Keychain storage. Reload the extension and try again.",
  },
  win32: {
    denied: "Windows Credential Manager denied access. Check that your Windows account can store credentials and try again.",
    unavailable: "Could not access Windows Credential Manager. Reload the extension and try again.",
  },
};

export class SecretStoreError extends Error {
  constructor(public readonly code: SecretStoreErrorCode, platform?: NativePlatform) {
    super({
      unsupported: "Secure storage is not supported on this platform.",
      "invalid-input": "Secure storage received an invalid key or secret.",
      "invalid-data": "The stored secret has an unsupported or damaged format.",
      denied: platform ? platform_messages[platform].denied : "Secure storage access was denied.",
      unavailable: platform ? platform_messages[platform].unavailable : "Could not access secure storage. Reload the extension and try again.",
    }[code]);
    this.name = "SecretStoreError";
  }
}

/**How a native library reports outcomes: macOS returns Keychain OSStatus values, Windows returns Win32 error codes.*/
interface NativeProfile {
  platform: NativePlatform;
  not_found: number;
  denied: number[];
  invalid_input: number[];
  invalid_data: number[];
}

const mac_profile: NativeProfile = {
  platform: "darwin", not_found: -25300, denied: [-25293, -25308, -128], invalid_input: [-50], invalid_data: [-26275],
};

//ERROR_NOT_FOUND, then ERROR_ACCESS_DENIED and ERROR_CANCELLED, ERROR_INVALID_PARAMETER and ERROR_INVALID_DATA
const windows_profile: NativeProfile = {
  platform: "win32", not_found: 1168, denied: [5, 1223], invalid_input: [87], invalid_data: [13],
};

//On macOS, a new service avoids inheriting entries whose access controls trust the shared security CLI.
const native_service = "com.setreports.easybatch.native";

class NativeSecretStore implements SecretStore {
  constructor(
    private readonly profile: NativeProfile,
    private readonly service: string,
    private readonly adapter?: Pick<CSAdapter, "Eval" | "GetSystemPath">,
  ) {}

  private Validate(key: string): void {
    const identifier = /^[a-zA-Z0-9._:/@-]{1,256}$/;
    if (!identifier.test(this.service) || !identifier.test(key)) throw new SecretStoreError("invalid-input");
  }

  private async Run(action: "get" | "set" | "delete", key: string, value?: string): Promise<SecretStoreResult> {
    const { platform, not_found } = this.profile;
    this.Validate(key);
    if (cep_node.require("os").platform() !== platform) throw new SecretStoreError("unsupported");
    const adapter = this.adapter ?? new CSAdapter();
    let response: unknown;
    try {
      const raw = await adapter.Eval("SecretStoreRequest", adapter.GetSystemPath(CSAdapter.SystemPath.EXTENSION),
        JSON.stringify({ action, service: this.service, key, ...(value === undefined ? {} : { value }) }));
      response = JSON.parse(raw);
    } catch {
      //Bridge errors may echo arguments; never forward them to UI or logs.
      throw new SecretStoreError("unavailable", platform);
    }
    if (response === null || typeof response !== "object" || !("status" in response) ||
      typeof response.status !== "number" || !Number.isInteger(response.status)) throw new SecretStoreError("unavailable", platform);
    const status = response.status;
    if (status !== 0 && !(status === not_found && action !== "set")) {
      throw new SecretStoreError(
        this.profile.denied.includes(status) ? "denied" :
          this.profile.invalid_input.includes(status) ? "invalid-input" :
            this.profile.invalid_data.includes(status) ? "invalid-data" : "unavailable",
        platform,
      );
    }
    if (action === "get" && status === 0) {
      if (!("value" in response) || typeof response.value !== "string" || !response.value || response.value.includes("\0")) {
        throw new SecretStoreError("invalid-data", platform);
      }
      return { status, value: response.value };
    }
    return { status };
  }

  async Get(key: string): Promise<string | null> {
    const result = await this.Run("get", key);
    return result.status === this.profile.not_found ? null : result.value!;
  }

  async Set(key: string, value: string): Promise<void> {
    if (typeof value !== "string" || !value || value.includes("\0")) throw new SecretStoreError("invalid-input");
    await this.Run("set", key, value);
  }

  async Delete(key: string): Promise<void> {
    await this.Run("delete", key);
  }
}

/**Stores secrets in the default macOS Keychain through `native/EasyBatchSecretStore.bundle`.*/
export class MacSecretStore extends NativeSecretStore {
  constructor(service = native_service, adapter?: Pick<CSAdapter, "Eval" | "GetSystemPath">) {
    super(mac_profile, service, adapter);
  }
}

/**
 * Stores secrets as generic Windows Credential Manager entries through `native/EasyBatchSecretStore.<arch>.dll`.
 * Windows protects them per user account, not per application: any process running as this user can read them.
 */
export class WindowsSecretStore extends NativeSecretStore {
  constructor(service = native_service, adapter?: Pick<CSAdapter, "Eval" | "GetSystemPath">) {
    super(windows_profile, service, adapter);
  }
}
