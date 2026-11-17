import CSAdapter from "./CSAdapter.ts";
import type { SecretStoreResult } from "./Messaging.ts";

export interface SecretStore {
  Get(key: string): Promise<string | null>;
  Set(key: string, value: string): Promise<void>;
  Delete(key: string): Promise<void>;
}

/**Returns null on platforms where an OS secret store has not been implemented.*/
export function CreateSecretStore(): SecretStore | null {
  return cep_node.require("os").platform() === "darwin" ? new MacSecretStore() : null;
}

export type SecretStoreErrorCode = "unsupported" | "invalid-input" | "invalid-data" | "denied" | "unavailable";

export class SecretStoreError extends Error {
  constructor(public readonly code: SecretStoreErrorCode) {
    super({
      unsupported: "Secure storage is not supported on this platform.",
      "invalid-input": "Secure storage received an invalid key or secret.",
      "invalid-data": "The stored secret has an unsupported or damaged format.",
      denied: "Keychain access was denied or requires unlocking. Unlock your login keychain and try again.",
      unavailable: "Could not access native macOS Keychain storage. Reload the extension and try again.",
    }[code]);
    this.name = "SecretStoreError";
  }
}

export class MacSecretStore implements SecretStore {
  //A new service avoids inheriting entries whose access controls trust the shared security CLI.
  constructor(
    private readonly service = "com.setreports.easybatch.native",
    private readonly adapter?: Pick<CSAdapter, "Eval" | "GetSystemPath">,
  ) {}

  private Validate(key: string): void {
    const identifier = /^[a-zA-Z0-9._:/@-]{1,256}$/;
    if (!identifier.test(this.service) || !identifier.test(key)) throw new SecretStoreError("invalid-input");
  }

  private async Run(action: "get" | "set" | "delete", key: string, value?: string): Promise<SecretStoreResult> {
    this.Validate(key);
    if (cep_node.require("os").platform() !== "darwin") throw new SecretStoreError("unsupported");
    const adapter = this.adapter ?? new CSAdapter();
    let response: unknown;
    try {
      const raw = await adapter.Eval("SecretStoreRequest", adapter.GetSystemPath(CSAdapter.SystemPath.EXTENSION),
        JSON.stringify({ action, service: this.service, key, ...(value === undefined ? {} : { value }) }));
      response = JSON.parse(raw);
    } catch {
      //Bridge errors may echo arguments; never forward them to UI or logs.
      throw new SecretStoreError("unavailable");
    }
    if (response === null || typeof response !== "object" || !("status" in response) ||
      typeof response.status !== "number" || !Number.isInteger(response.status)) throw new SecretStoreError("unavailable");
    const status = response.status;
    if (status !== 0 && !(status === -25300 && action !== "set")) {
      throw new SecretStoreError(
        [-25293, -25308, -128].includes(status) ? "denied" :
          status === -50 ? "invalid-input" : status === -26275 ? "invalid-data" : "unavailable",
      );
    }
    if (action === "get" && status === 0) {
      if (!("value" in response) || typeof response.value !== "string" || !response.value || response.value.includes("\0")) {
        throw new SecretStoreError("invalid-data");
      }
      return { status, value: response.value };
    }
    return { status };
  }

  async Get(key: string): Promise<string | null> {
    const result = await this.Run("get", key);
    return result.status === -25300 ? null : result.value!;
  }

  async Set(key: string, value: string): Promise<void> {
    if (typeof value !== "string" || !value || value.includes("\0")) throw new SecretStoreError("invalid-input");
    await this.Run("set", key, value);
  }

  async Delete(key: string): Promise<void> {
    await this.Run("delete", key);
  }
}
