import { csa, l } from "./States.svelte.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Buffer } from "node:buffer";

//Both come from the git-ignored .env.local at build time. Google's desktop token endpoint requires
//the secret even with PKCE, but treats it as non-confidential.
const client_id: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const client_secret: string = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";

//Only files the user picks are accessible, never the whole Drive
const oauth_scope = "https://www.googleapis.com/auth/drive.file";
const sheets_mime = "application/vnd.google-apps.spreadsheet";

type JsonObject = Record<string, unknown>;
type GoogleOperation = "token" | "metadata" | "values" | "batchUpdate";

/**Reduces a Google error response to a known error code for the log. Never includes free text.*/
function GoogleErrorSummary(json: JsonObject): { code: string; detail?: string } {
  const error = json.error;
  const code = typeof error === "string" ? error :
    typeof error === "object" && error !== null && "status" in error && typeof error.status === "string" ? error.status : "";
  const known = [
    "invalid_request", "invalid_client", "invalid_grant", "unauthorized_client", "unsupported_grant_type", "invalid_scope",
    "INVALID_ARGUMENT", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "RESOURCE_EXHAUSTED",
    "FAILED_PRECONDITION", "ABORTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED",
  ];

  return {
    code: known.includes(code) ? code : "unknown",
    ...(json.error_description === "client_secret is missing." ? { detail: json.error_description } : {}),
  };
}

/**Builds the error message shown to the user, with any credential Google echoed back replaced by [redacted].*/
function RequestError(
  json: JsonObject,
  status: number | undefined,
  headers: Record<string, string>,
  body?: string,
): string {
  const error = json.error;
  const code = typeof error === "string" ? error : "";
  const detail = typeof json.error_description === "string" ? json.error_description :
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "";
  let message = code && detail && code !== detail ? `${code}: ${detail}` : code || detail || `HTTP ${status ?? "unknown"}`;

  //Collect everything we sent that must not appear in a message
  const secrets: string[] = [];
  const authorization = headers.Authorization;
  if (authorization?.startsWith("Bearer ")) secrets.push(authorization.slice(7));

  if (body && headers["Content-Type"] === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(body);

    for (const key of ["code", "code_verifier", "client_secret", "refresh_token"]) {
      const value = params.get(key);
      if (value) secrets.push(value);
    }
  }

  for (const secret of secrets) {
    for (const value of [secret, encodeURIComponent(secret)]) {
      message = message.split(value).join("[redacted]");
    }
  }

  return message;
}

/**Sends a request to Google and returns the JSON response. Uses fetch so it shows in the DevTools Network panel.*/
async function RequestJson(url: string, method: string, headers: Record<string, string>, operation: GoogleOperation, body?: string): Promise<JsonObject> {
  const started = Date.now();

  //Aborts the request if Google does not answer in time
  const controller = new AbortController();
  let timed_out = false;
  const timer = setTimeout(() => {
    timed_out = true;
    controller.abort();
  }, 30000);

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method, headers, body, signal: controller.signal,
      credentials: "omit", redirect: "error", cache: "no-store",
    });
    text = await response.text();
  } catch {
    l.warn("[GoogleSheets] Request did not complete", { operation, timed_out, elapsed_ms: Date.now() - started });
    throw new Error(timed_out ? "Google request timed out." : "Google request failed before a readable response (network, CORS, or redirect error).");
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    l.warn("[GoogleSheets] Invalid response", { operation, status: response.status, elapsed_ms: Date.now() - started });
    throw new Error("Google returned an invalid response.");
  }

  const json: JsonObject = parsed as JsonObject;
  if (!response.ok) {
    l.warn("[GoogleSheets] Request failed", { operation, status: response.status, elapsed_ms: Date.now() - started, error: GoogleErrorSummary(json) });
    const description = operation === "token" ? "authorization token exchange" : "Sheets request";
    throw new Error(`Google ${description} failed: ${RequestError(json, response.status, headers, body)}`);
  }

  l.debug("[GoogleSheets] Request completed", { operation, status: response.status, elapsed_ms: Date.now() - started });
  return json;
}

function EncodeBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Talks to Google Sheets. The user signs in and picks a spreadsheet in their browser; the access token
 * is kept in memory only, so it is gone when the extension closes.
 */
export class GoogleSheetsClient {
  private access_token = "";
  private expires_at = 0;
  private authorization_in_progress = false;

  //Incremented on cancel, so an authorization that finishes later knows it was cancelled
  private authorization_version = 0;
  private cancel_authorization: (() => void) | undefined;

  CancelAuthorization(): void {
    this.authorization_version++;
    this.cancel_authorization?.();
  }

  /**
   * Opens the browser for the user to sign in, and exchanges the returned code for an access token.
   * When `picker` is true the user also picks a spreadsheet, whose id is returned.
   */
  async Authorize(picker: boolean, file_id?: string): Promise<string | null> {
    if (this.authorization_in_progress) throw new Error("Google authorization is already in progress.");
    this.authorization_in_progress = true;

    const version = this.authorization_version;
    let stage = "initializing";

    try {
      if (!client_id || !client_secret) {
        throw new Error("Google credentials are not configured. Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in .env.local, then restart the dev server or rebuild.");
      }

      const crypto = cep_node.require("crypto");
      const http = cep_node.require("http");

      //PKCE: Google only sees the hash of the verifier until we exchange the code, and state ties the reply to this request
      const verifier = EncodeBase64Url(crypto.randomBytes(32));
      const challenge = EncodeBase64Url(crypto.createHash("sha256").update(verifier).digest());
      const state = EncodeBase64Url(crypto.randomBytes(32));

      stage = "waiting-for-browser";
      const callback = await new Promise<{ code: string; picked: string | null; redirect: string }>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        let redirect = "";

        //Local server that receives Google's redirect, only reachable from this computer
        const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
          const url = new URL(request.url ?? "/", redirect);

          if (request.method !== "GET" || url.pathname !== "/oauth/callback" || url.searchParams.get("state") !== state) {
            l.warn("[GoogleSheets] Rejected authorization callback", {
              path_matches: url.pathname === "/oauth/callback", state_matches: url.searchParams.get("state") === state,
            });
            response.writeHead(400, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
            response.end("Invalid authorization response.");
            return;
          }

          const error = url.searchParams.get("error");
          const code = url.searchParams.get("code");
          const picked = url.searchParams.get("picked_file_ids");

          response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
          response.end(error || !code ? "Authorization was not completed. You may close this tab." : "Authorization complete. You may return to EasyBatch.");

          clearTimeout(timer);
          this.cancel_authorization = undefined;
          server.close();

          if (error || !code) {
            l.warn("[GoogleSheets] Authorization callback had no code", { error: error ?? null });
            reject(new Error(error === "access_denied" ? "Google authorization was cancelled." : `Google authorization failed: ${error || "missing authorization code"}`));
            return;
          }

          resolve({ code, picked, redirect });
        });

        server.on("error", (error: Error) => {
          clearTimeout(timer);
          this.cancel_authorization = undefined;
          reject(error);
        });

        this.cancel_authorization = () => {
          clearTimeout(timer);
          this.cancel_authorization = undefined;
          server.close();
          reject(new Error("Google authorization was cancelled."));
        };

        //Port 0 lets the system choose a free port, which Google accepts for desktop clients
        server.listen(0, "127.0.0.1", () => {
          redirect = `http://localhost:${server.address().port}/oauth/callback`;

          const params = new URLSearchParams({
            client_id, redirect_uri: redirect, response_type: "code",
            scope: oauth_scope, state, code_challenge: challenge, code_challenge_method: "S256",
          });

          //These parameters make Google show the file picker as part of the consent
          if (picker) {
            params.set("prompt", "consent");
            params.set("trigger_onepick", "true");
            params.set("mimetypes", sheets_mime);
            if (file_id) params.set("file_ids", file_id);
          }

          timer = setTimeout(() => {
            this.cancel_authorization = undefined;
            server.close();
            reject(new Error("Google authorization timed out."));
          }, 300000);

          try {
            csa.OpenURLInDefaultBrowser(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
          } catch (error) {
            clearTimeout(timer);
            this.cancel_authorization = undefined;
            server.close();
            reject(error);
          }
        });
      });

      stage = "validating-selection";
      if (picker && (!callback.picked || !/^[a-zA-Z0-9_-]+$/.test(callback.picked))) {
        throw new Error("No Google spreadsheet was selected.");
      }
      if (file_id && callback.picked !== file_id) throw new Error("The selected spreadsheet does not match the requested source.");

      const body = new URLSearchParams({
        client_id, client_secret, code: callback.code, code_verifier: verifier,
        redirect_uri: callback.redirect, grant_type: "authorization_code",
      }).toString();

      stage = "exchanging-code";
      const tokens = await RequestJson("https://oauth2.googleapis.com/token", "POST", {
        "Content-Type": "application/x-www-form-urlencoded",
      }, "token", body);

      if (version !== this.authorization_version) throw new Error("Google authorization was cancelled.");
      if (typeof tokens.access_token !== "string" || typeof tokens.expires_in !== "number") {
        throw new Error("Google did not return a valid access token.");
      }

      //Expire a minute early so a request never starts with a token about to lapse
      this.access_token = tokens.access_token;
      this.expires_at = Date.now() + Math.max(0, tokens.expires_in - 60) * 1000;
      return callback.picked;
    } catch (error) {
      l.warn("[GoogleSheets] Authorization failed", { stage, cancelled: version !== this.authorization_version, reason: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.authorization_in_progress = false;
    }
  }

  /**Lets the user pick a spreadsheet and returns its id.*/
  async Pick(): Promise<string> {
    const picked = await this.Authorize(true);
    if (!picked) throw new Error("No Google spreadsheet was selected.");
    return picked;
  }

  /**Calls the Sheets API, asking the user to sign in again if there is no valid token.*/
  private async Request(path: string, file_id: string, operation: GoogleOperation, method = "GET", data?: unknown): Promise<JsonObject> {
    if (!this.access_token || Date.now() >= this.expires_at) await this.Authorize(true, file_id);
    const body = data === undefined ? undefined : JSON.stringify(data);
    return RequestJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file_id)}${path}`, method, {
      Authorization: `Bearer ${this.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    }, operation, body);
  }

  /**Returns the spreadsheet title and the names of its sheets.*/
  async Metadata(file_id: string): Promise<{ name: string; sheets: string[] }> {
    const json = await this.Request("?fields=properties(title),sheets(properties(title))", file_id, "metadata");
    const properties = json.properties as { title?: unknown } | undefined;
    const sheets = json.sheets as { properties?: { title?: unknown } }[] | undefined;

    if (typeof properties?.title !== "string" || !Array.isArray(sheets) || sheets.some((item) => typeof item.properties?.title !== "string")) {
      throw new Error("Google returned invalid spreadsheet metadata.");
    }

    return { name: properties.title, sheets: sheets.map((item) => item.properties!.title as string) };
  }

  /**Reads all rows of a sheet. With `formulas`, formula cells come back as their "=..." text instead of their result.*/
  async Values(file_id: string, sheet: string, formulas = false): Promise<unknown[][]> {
    const range = `'${sheet.replace(/'/g, "''")}'`;
    const json = await this.Request(`/values/${encodeURIComponent(range)}?valueRenderOption=${formulas ? "FORMULA" : "UNFORMATTED_VALUE"}`, file_id, "values");

    //Google omits the field for an empty sheet
    if (json.values === undefined) return [];
    if (!Array.isArray(json.values) || json.values.some((row) => !Array.isArray(row))) throw new Error("Google returned invalid sheet values.");

    return json.values as unknown[][];
  }

  /**Writes the given ranges as plain values (RAW), so text such as "=1+1" is never turned into a formula.*/
  async Update(file_id: string, data: { range: string; values: unknown[][] }[]): Promise<void> {
    if (data.length === 0) return;
    await this.Request("/values:batchUpdate", file_id, "batchUpdate", "POST", { valueInputOption: "RAW", data });
  }
}

export const google_sheets = new GoogleSheetsClient();

/**Extracts the spreadsheet id from a saved link. Only links we generated ourselves are accepted.*/
export function SpreadsheetId(url: string): string {
  const match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)\/edit$/.exec(url);
  if (!match) throw new Error("The saved Google Sheets source is invalid.");
  return match[1];
}

export function SpreadsheetUrl(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("The Google spreadsheet ID is invalid.");
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/**Splits sheet values into the header row (the first non-empty row) and the non-empty rows after it.*/
export function ReadSheet(values: unknown[][]): { headers: string[]; rows: unknown[][]; row_indices: number[] } {
  const is_filled = (row: unknown[]) => row.some((value) => value !== "" && value !== null && value !== undefined);

  const header_index = values.findIndex(is_filled);
  if (header_index < 0) return { headers: [], rows: [], row_indices: [] };

  //Positions of the data rows in the sheet, needed later to write back to the same rows
  const row_indices: number[] = [];
  for (let i = header_index + 1; i < values.length; i++) {
    if (is_filled(values[i])) row_indices.push(i);
  }

  return {
    headers: values[header_index].map((value) => String(value ?? "").trim()),
    rows: row_indices.map((index) => values[index]),
    row_indices,
  };
}

/**
 * Builds the cell updates that save the template values into the sheet's mapped columns.
 * `formulas` is the same sheet read with formulas, so formula cells are skipped instead of overwritten.
 */
export function PrepareSheetUpdates(
  sheet: string,
  values: unknown[][],
  formulas: unknown[][],
  mapping: Record<string, string | null>,
  columns: { cont_name: string; values: unknown[] }[],
): {
  data: { range: string; values: unknown[][] }[];
  stats: { written_cells: number; formula_cells_skipped: number; missing_columns: string[] };
} {
  const parsed = ReadSheet(values);
  if (parsed.headers.length === 0) throw new Error("The selected Google sheet does not contain a header row.");

  const row_indices = [...parsed.row_indices];
  const last_row = Math.max(values.length, formulas.length);
  const data: { range: string; values: unknown[][] }[] = [];
  const written_headers = new Set<string>();
  const stats = { written_cells: 0, formula_cells_skipped: 0, missing_columns: [] as string[] };

  for (const [template_prop, source_col] of Object.entries(mapping)) {
    if (!source_col) continue;

    const column = columns.find((item) => item.cont_name === template_prop);
    const matches = parsed.headers.reduce<number[]>((indices, header, index) => {
      if (header === source_col) indices.push(index);
      return indices;
    }, []);

    if (!column || matches.length === 0) {
      stats.missing_columns.push(source_col);
      continue;
    }

    //Writing into a repeated header would be a guess, so we refuse
    if (matches.length !== 1 || written_headers.has(source_col)) {
      throw new Error(`Cannot save updates: the Google Sheets column "${source_col}" is ambiguous.`);
    }

    written_headers.add(source_col);
    const col_index = matches[0];

    //Column number to letters: 0 = A, 25 = Z, 26 = AA
    let letters = "";
    for (let i = col_index + 1; i > 0; i = Math.floor((i - 1) / 26)) {
      letters = String.fromCharCode(65 + (i - 1) % 26) + letters;
    }

    column.values.forEach((value, row_index) => {
      //Rows beyond the sheet's last row are appended after it
      if (row_indices[row_index] === undefined) row_indices[row_index] = last_row + row_index - parsed.row_indices.length;

      const sheet_row = row_indices[row_index];
      const existing = formulas[sheet_row]?.[col_index];
      if (typeof existing === "string" && existing.startsWith("=")) {
        stats.formula_cells_skipped++;
        return;
      }

      const cell = value === null || value === undefined ? "" :
        typeof value === "object" ? JSON.stringify(value) : value;
      data.push({ range: `'${sheet.replace(/'/g, "''")}'!${letters}${sheet_row + 1}`, values: [[cell]] });
      stats.written_cells++;
    });
  }

  return { data, stats };
}
